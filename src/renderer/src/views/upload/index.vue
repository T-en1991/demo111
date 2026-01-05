<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useFishControlStore } from '@renderer/store/fishControl'

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
      ElMessage.error('当前环境不支持系统对话框，请在 Electron 中使用此功能')
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
    ElMessage.error('选择文件夹失败')
  }
}

// Import alarm data from selected folder
async function importAlarmData(): Promise<void> {
  if (!selectedAlarmFolder.value) {
    ElMessage.warning('请先选择文件夹')
    return
  }

  try {
    // @ts-ignore
    const result = await window.api.alarm.importFolder(selectedAlarmFolder.value)

    if (result.ok > 0) {
      ElMessage.success(`成功导入 ${result.ok} 条报警记录`)
    }
    if (result.fail > 0) {
      ElMessage.warning(`${result.fail} 条报警记录导入失败`)
    }
    if (result.updated > 0) {
      ElMessage.info(`更新了 ${result.updated} 条报警记录`)
    }

    // Clear selection after import
    clearAlarm()
  } catch (e) {
    console.error('importAlarmData failed', e)
    ElMessage.error('导入报警数据失败')
  }
}

function isAbsWinPath(p: string): boolean {
  return /^(?:[A-Za-z]:\\|\\\\)/.test(p)
}

// Save videos but auto-detect camera type from filename prefix (mcam=mono, bcam=stereo)
async function saveVideosWithCamera(forceCamera: 'mono' | 'stereo' | 'unknown'): Promise<void> {
  const files = videoFiles.value
  if (!files.length) {
    ElMessage.warning('请先选择视频文件')
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
    if (!p || !isAbsWinPath(p)) {
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

      await window.api.video.create({
        path: p,
        name: f.name,
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
    ElMessage.success(`成功保存 ${ok} 个视频记录`)
    clearVideo()
  }
  if (fail > 0) {
    ElMessage.warning(`${fail} 个文件保存失败（命名或路径不符合要求）`)
  }
}

// Safe helper: open system dialog (via preload) to choose xlsx files
async function chooseFiles(): Promise<void> {
  try {
    // @ts-ignore
    if (typeof window === 'undefined' || !(window as any).api || !(window as any).api.dialog) {
      ElMessage.error('当前环境不支持系统对话框，请在 Electron 中使用此功能')
      return
    }
    // @ts-ignore
    const items = await window.api.dialog.openXlsx()
    if (!items) return
    dataFiles.value = items
  } catch (e) {
    console.error('chooseFiles failed', e)
    ElMessage.error('选择文件失败')
  }
}

// Import all selected files sequentially and show aggregated results
async function importSelectedFiles(): Promise<void> {
  if (!dataFiles.value.length) {
    ElMessage.warning('请先选择文件')
    return
  }
  try {
    const results: { file: string; ok: boolean; error?: string; inserted?: number; updated?: number; failed?: number }[] = []
    let totalInserted = 0
    let totalUpdated = 0
    let totalFailed = 0

    for (const f of dataFiles.value) {
      try {
        // @ts-ignore
        const res = await window.api.history.importXlsx(f.path)
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
    ElMessage.success(`已导入：${totalInserted} 条，更新：${totalUpdated} 条，失败：${totalFailed} 条`)
    dataFiles.value = []
  } catch (e) {
    console.error('importSelectedFiles failed', e)
    ElMessage.error('导入过程中发生错误')
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
    ElMessage.error('选择视频失败')
  }
}

async function openWinSCP(): Promise<void> {
  try {
    const ok = await window.api.openWinSCP()
    if (!ok) {
      ElMessage.error('无法打开 WinSCP，请确认本机已安装')
    }
  } catch (e) {
    console.error('Open WinSCP failed:', e)
    ElMessage.error('打开 WinSCP 失败')
  }
}

async function openWifi(): Promise<void> {
  try {
    await fishControlStore.sendCommand('wifi')
  } catch (e) {
    console.error('Open WIFI failed:', e)
    ElMessage.error('发送 WIFI 指令失败')
  }
}
</script>

<template>
  <section class="upload-page">
    <header class="page-header">
      <h1>上传数据</h1>
      <p class="sub">支持拖拽或点击选择文件，分为：视频上传、数据上传、报警数据上传</p>
    </header>

    <el-card class="upload-card" shadow="hover">
      <div class="actions">
        <el-button type="primary" plain @click="openWinSCP">打开 WinSCP</el-button>
        <el-button type="success" plain @click="openWifi">打开 WIFI</el-button>
        <el-button type="danger" plain @click="openWifiOff">关闭 WIFI</el-button>
      </div>
      <el-tabs v-model="activeTab" class="upload-tabs">
        <el-tab-pane label="视频上传" name="video">
          <div class="upload-inline">
            <div class="upload-box">
              <div class="el-upload__text">选择.mkv视频文件（支持多选）</div>
              <div style="margin-top:12px; display:flex; gap:8px; align-items:center">
                <el-button type="primary" @click="selectVideosAndSave">选择文件</el-button>


                <el-button type="primary" @click="() => saveVideosWithCamera('stereo')">保存</el-button>
                <el-button text type="danger" @click="clearVideo">清空</el-button>
              </div>

              <div v-if="videoFiles.length" class="upload-list" style="margin-top:12px">
                <div class="list-head">
                  <span>已选择 {{ videoFiles.length }} 个文件</span>
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

        <el-tab-pane label="数据上传" name="data">
          <div class="upload-inline">
            <div class="upload-box">
              <div class="el-upload__text">选择csv文件（支持多选,通常tx开头文件）</div>
              <div style="margin-top:12px; display:flex; gap:8px;">
                <el-button type="primary" @click="chooseFiles">选择文件</el-button>
                <el-button type="primary" @click="importSelectedFiles">导入</el-button>
                <el-button text type="danger" @click="clearData">清空</el-button>
              </div>
              <div v-if="dataFiles.length" class="upload-list" style="margin-top:12px">
                <div class="list-head">
                  <span>已选择 {{ dataFiles.length }} 个文件</span>
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
        <el-tab-pane label="报警数据上传" name="alarm">
          <div class="upload-inline">
            <div class="upload-box">
              <div class="el-upload__text">选择包含报警数据的文件夹(logs\anomaly_alerts)</div>
              <div style="margin-top:12px; display:flex; gap:8px; align-items:center">
                <el-button type="primary" @click="selectAlarmFolder">选择文件夹</el-button>
                <el-button type="primary" @click="importAlarmData" :disabled="!selectedAlarmFolder">导入</el-button>
                <el-button text type="danger" @click="clearAlarm">清空</el-button>
              </div>

              <div v-if="selectedAlarmFolder" class="upload-list" style="margin-top:12px">
                <div class="list-head">
                  <span>已选择文件夹：{{ selectedAlarmFolder }}</span>
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
