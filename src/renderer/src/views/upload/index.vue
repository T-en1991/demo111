<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useFishControlStore } from '@renderer/store/fishControl'
import { useI18n } from 'vue-i18n'
import { isAbsolutePath } from '../../utils/path'

const { t } = useI18n()

type UploadKind = 'video' | 'data' | 'alarm'
interface UFile {
  name: string
  size: number
  type?: string
  path?: string
}

const activeTab = ref<UploadKind>('video')
const videoFiles = ref<UFile[]>([])
const dataFiles = ref<UFile[]>([])
const alarmFiles = ref<UFile[]>([])
const selectedAlarmFolder = ref<string>('')
const fishControlStore = useFishControlStore()

// Fish selection
const fishList = ref<any[]>([])
const selectedFishId = ref<number | undefined>(undefined)

onMounted(async () => {
  try {
    fishList.value = await window.api.fish.findAll()
    if (fishList.value.length > 0) {
      selectedFishId.value = fishList.value[0].id
    }
  } catch (e) {
    console.error('Failed to load fish list', e)
  }
})

function clearVideo(): void {
  videoFiles.value = []
}

function clearData(): void {
  dataFiles.value = []
}

function clearAlarm(): void {
  alarmFiles.value = []
  selectedAlarmFolder.value = ''
}

// Select alarm folder using system dialog
async function selectAlarmFolder(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !(window as any).api || !(window as any).api.dialog) {
      ElMessage.error(t('common.error'))
      return
    }
    // @ts-ignore
    const folderPath = await window.api.dialog.openDirectory()
    if (!folderPath) return

    selectedAlarmFolder.value = folderPath
    // List alarm files in the folder
    // @ts-ignore
    const files = await window.api.alarm.listFiles(folderPath)
    alarmFiles.value = files
  } catch (e) {
    console.error('selectAlarmFolder failed', e)
    ElMessage.error(t('upload.selectFolder') + ' ' + t('common.error'))
  }
}

// Import alarm data from selected folder
async function importAlarmData(): Promise<void> {
  if (!selectedFishId.value) {
    ElMessage.warning('请先选择机器鱼')
    return
  }
  if (!selectedAlarmFolder.value) {
    ElMessage.warning(t('upload.selectFolder'))
    return
  }

  try {
    // @ts-ignore
    const result = await window.api.alarm.importFolder(selectedAlarmFolder.value, selectedFishId.value)

    if (result.ok > 0) {
      ElMessage.success(t('upload.importSuccess', { count: result.ok }))
    }
    if (result.fail > 0) {
      ElMessage.warning(t('upload.importFail', { count: result.fail }))
    }
    if (result.updated > 0) {
      ElMessage.info(t('upload.importUpdate', { count: result.updated }))
    }

    // Clear selection after import
    clearAlarm()
  } catch (e) {
    console.error('importAlarmData failed', e)
    ElMessage.error(t('upload.importFail', { count: 0 }))
  }
}

// Save videos but auto-detect camera type from filename prefix (mcam=mono, bcam=stereo)
async function saveVideosWithCamera(forceCamera: 'mono' | 'stereo' | 'unknown'): Promise<void> {
  if (!selectedFishId.value) {
    ElMessage.warning('请先选择机器鱼')
    return
  }
  const files = videoFiles.value
  if (!files.length) {
    ElMessage.warning(t('upload.selectVideo'))
    return
  }

  let ok = 0
  let fail = 0

  for (const f of files) {
    const match = f.name.match(/^(\w+)_(\d{8})_(\d{6})/)
    if (!match) {
      console.warn('文件名不符合规范:', f.name)
      fail++
      continue
    }

    const [_, typeStr, dateStr, timeStr] = match
    const Y = dateStr.slice(0, 4)
    const M = dateStr.slice(4, 6)
    const D = dateStr.slice(6, 8)
    const h = timeStr.slice(0, 2)
    const m = timeStr.slice(2, 4)
    const s = timeStr.slice(4, 6)
    const isoString = `${Y}-${M}-${D}T${h}:${m}:${s}`

    const p = f.path
    if (!p || !isAbsolutePath(p)) {
      fail++
      continue
    }
    try {
      // Auto-detect camera type from filename prefix
      let cameraType: 'mono' | 'stereo' | 'unknown' = forceCamera
      if (typeStr.toLowerCase() === 'mcam') {
        cameraType = 'mono' // mcam 开头是单目
      } else if (typeStr.toLowerCase() === 'bcam') {
        cameraType = 'stereo' // bcam 开头是双目
      }

      let finalPath = p
      let finalName = f.name

      // Transcode MKV if needed
      if (finalPath.toLowerCase().endsWith('.mkv')) {
        // @ts-ignore
        if ((window as any).api.media && (window as any).api.media.transcode) {
          ElMessage.info(`正在转码: ${f.name}`)
          // @ts-ignore
          finalPath = await window.api.media.transcode(p)
          finalName = finalName.replace(/\.mkv$/i, '.mp4')
        }
      }

      await window.api.video.create({
        fishId: selectedFishId.value,
        path: finalPath,
        name: finalName,
        size: f.size,
        camera: cameraType,
        recordedAt: isoString
      })
      ok++
    } catch (e) {
      console.error('Save failed:', e)
      fail++
    }
  }

  if (ok > 0) {
    ElMessage.success(t('upload.importSuccess', { count: ok }))
    clearVideo()
  }
  if (fail > 0) {
    ElMessage.warning(t('upload.importFail', { count: fail }))
  }
}

// Safe helper: open system dialog (via preload) to choose xlsx files
async function chooseFiles(): Promise<void> {
  try {
    // @ts-ignore
    if (typeof window === 'undefined' || !(window as any).api || !(window as any).api.dialog) {
      ElMessage.error(t('common.error'))
      return
    }
    // @ts-ignore
    const items = await window.api.dialog.openXlsx()
    if (!items) return
    dataFiles.value = items
  } catch (e) {
    console.error('chooseFiles failed', e)
    ElMessage.error(t('upload.selectFile') + ' ' + t('common.error'))
  }
}

// Import all selected files sequentially and show aggregated results
async function importSelectedFiles(): Promise<void> {
  if (!selectedFishId.value) {
    ElMessage.warning('请先选择机器鱼')
    return
  }
  if (!dataFiles.value.length) {
    ElMessage.warning(t('upload.selectFile'))
    return
  }
  try {
    const results: {
      file: string
      ok: boolean
      error?: string
      inserted?: number
      updated?: number
      failed?: number
    }[] = []
    let totalInserted = 0
    let totalUpdated = 0
    let totalFailed = 0

    for (const f of dataFiles.value) {
      try {
        // @ts-ignore
        const res = await window.api.history.importXlsx(f.path, selectedFishId.value)
        if (res && (res as any).error) {
          results.push({ file: f.name, ok: false, error: (res as any).error })
        } else {
          const inserted = Number((res && (res as any).inserted) || 0)
          const updated = Number((res && (res as any).updated) || 0)
          const failedCount = Number((res && (res as any).failed) || 0)
          totalInserted += inserted
          totalUpdated += updated
          totalFailed += failedCount
          results.push({ file: f.name, ok: true, inserted, updated, failed: failedCount })
        }
      } catch (err) {
        results.push({ file: f.name, ok: false, error: (err as any)?.message || String(err) })
      }
    }

    const failed = results.filter((r) => !r.ok)
    if (failed.length) {
      ElMessage.error(`部分文件导入失败: ${failed.map((f) => f.file).join(', ')}`)
      console.error('import failures:', failed)
    }

    // Show aggregated summary of imported rows
    ElMessage.success(
      t('upload.dataImportResult', { inserted: totalInserted, updated: totalUpdated, failed: totalFailed })
    )
    dataFiles.value = []
  } catch (e) {
    console.error('importSelectedFiles failed', e)
    ElMessage.error(t('upload.importFail', { count: 0 }))
  }
}

async function selectVideosAndSave(): Promise<void> {
  try {
    const items = await window.api.dialog.openVideos()
    if (!items || items.length === 0) return
    videoFiles.value = items.map((it) => ({
      name: it.name,
      size: it.size,
      type: undefined,
      path: it.path
    }))
    // do not auto-save here — the user should click 导入 to perform the import (same UX as Excel)
  } catch (e) {
    console.error('open dialog failed:', e)
    ElMessage.error(t('upload.selectVideo') + ' ' + t('common.error'))
  }
}

async function openWinSCP(): Promise<void> {
  try {
    const ok = await window.api.openWinSCP()
    if (!ok) {
      ElMessage.error(t('upload.winScpFail'))
    }
  } catch (e) {
    console.error('Open WinSCP failed:', e)
    ElMessage.error(t('upload.openWinSCP') + ' ' + t('common.error'))
  }
}

async function openWifi(): Promise<void> {
  try {
    await fishControlStore.sendCommand('wifi')
  } catch (e) {
    console.error('Open WIFI failed:', e)
    ElMessage.error(t('upload.openWifi') + ' ' + t('common.error'))
  }
}

async function openWifiOff(): Promise<void> {
  try {
    await fishControlStore.sendCommand('wifiOff')
  } catch (e) {
    console.error('Close WIFI failed:', e)
    ElMessage.error(t('upload.closeWifi') + ' ' + t('common.error'))
  }
}
</script>

<template>
  <section class="upload-page">
    <header class="page-header">
      <h1>{{ t('upload.title') }}</h1>
      <p class="sub">{{ t('upload.sub') }}</p>
    </header>

    <el-card class="upload-card" shadow="hover">
      <div class="top-bar">
        <div class="fish-select">
          <span>选择机器鱼：</span>
          <el-select v-model="selectedFishId" placeholder="请选择机器鱼" style="width: 240px">
            <el-option
              v-for="fish in fishList"
              :key="fish.id"
              :label="fish.name + (fish.acousticId ? ` (ID:${fish.acousticId})` : '')"
              :value="fish.id"
            />
          </el-select>
        </div>
        <div class="actions">
          <el-button type="primary" plain @click="openWinSCP">{{ t('upload.openWinSCP') }}</el-button>
          <el-button type="success" plain @click="openWifi">{{ t('upload.openWifi') }}</el-button>
          <el-button type="danger" plain @click="openWifiOff">{{ t('upload.closeWifi') }}</el-button>
        </div>
      </div>

      <el-tabs v-model="activeTab" class="upload-tabs">
        <el-tab-pane :label="t('upload.videoUpload')" name="video">
          <div class="upload-inline">
            <div class="upload-box">
              <div class="el-upload__text">{{ t('upload.selectVideo') }}</div>
              <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center">
                <el-button type="primary" @click="selectVideosAndSave">{{ t('upload.selectFile') }}</el-button>

                <el-button type="primary" @click="() => saveVideosWithCamera('stereo')" :disabled="!videoFiles.length"
                  >{{ t('upload.import') }}</el-button
                >
                <el-button text type="danger" @click="clearVideo">{{ t('upload.clear') }}</el-button>
              </div>

              <div v-if="videoFiles.length" class="upload-list" style="margin-top: 12px">
                <div class="list-head">
                  <span>{{ t('upload.selectedFiles', { count: videoFiles.length }) }}</span>
                </div>
                <ul>
                  <li v-for="f in videoFiles" :key="'v:' + f.path">
                    <span class="name" :title="f.name">{{ f.name }}</span>
                    <span class="size">{{ (f.size / 1024).toFixed(1) }} KB</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="t('upload.dataUpload')" name="data">
          <div class="upload-inline">
            <div class="upload-box">
              <div class="el-upload__text">{{ t('upload.selectData') }} (支持 .xlsx, .xls, .csv)</div>
              <div style="margin-top: 12px; display: flex; gap: 8px">
                <el-button type="primary" @click="chooseFiles">{{ t('upload.selectFile') }}</el-button>
                <el-button type="primary" @click="importSelectedFiles" :disabled="!dataFiles.length">{{ t('upload.import') }}</el-button>
                <el-button text type="danger" @click="clearData">{{ t('upload.clear') }}</el-button>
              </div>
              <div v-if="dataFiles.length" class="upload-list" style="margin-top: 12px">
                <div class="list-head">
                  <span>{{ t('upload.selectedFiles', { count: dataFiles.length }) }}</span>
                </div>
                <ul>
                  <li v-for="f in dataFiles" :key="'d:' + f.path">
                    <span class="name" :title="f.name">{{ f.name }}</span>
                    <span class="size">{{ (f.size / 1024).toFixed(1) }} KB</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane :label="t('upload.alarmUpload')" name="alarm">
          <div class="upload-inline">
            <div class="upload-box">
              <div class="el-upload__text">{{ t('upload.selectAlarm') }}</div>
              <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center">
                <el-button type="primary" @click="selectAlarmFolder">{{ t('upload.selectFolder') }}</el-button>
                <el-button type="primary" @click="importAlarmData" :disabled="!selectedAlarmFolder"
                  >{{ t('upload.import') }}</el-button
                >
                <el-button text type="danger" @click="clearAlarm">{{ t('upload.clear') }}</el-button>
              </div>

              <div v-if="selectedAlarmFolder" class="upload-list" style="margin-top: 12px">
                <div class="list-head">
                  <span>{{ t('upload.selectedFolder', { path: selectedAlarmFolder }) }}</span>
                </div>
                <div v-if="alarmFiles.length > 0" class="list-body">
                  <div class="sub-title">包含报警文件：</div>
                  <ul>
                    <li v-for="f in alarmFiles" :key="'a:' + f.name">
                      <span class="name" :title="f.name">{{ f.name }}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </section>
</template>

<style scoped src="./index.scss"></style>
