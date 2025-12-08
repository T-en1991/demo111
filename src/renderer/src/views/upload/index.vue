<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile, UploadFiles } from 'element-plus'
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
const fishControlStore = useFishControlStore()

function filesToUFiles(fileList: UploadFiles): UFile[] {
  return (fileList ?? []).map((f: UploadFile) => ({
    name: f.name,
    size: typeof f.size === 'number' ? f.size : 0,
    type: f.raw?.type,
    path: (f.raw as any)?.path
  }))
}

// video selection now uses system dialog (choose via preload), not el-upload drag/drop
function onAlarmChange(_file: UploadFile, fileList: UploadFiles): void {
  alarmFiles.value = filesToUFiles(fileList)
}

function clearVideo(): void {
  videoFiles.value = []
}

function clearData(): void {
  dataFiles.value = []
}

function clearAlarm(): void {
  alarmFiles.value = []
}

function isAbsWinPath(p: string): boolean {
  return /^(?:[A-Za-z]:\\|\\\\)/.test(p)
}


async function saveVideos(): Promise<void> {
  const files = videoFiles.value
  if (!files.length) {
    ElMessage.warning('请先选择视频文件')
    return
  }

  let ok = 0
  let fail = 0

  for (const f of files) {
    // 解析文件名：bcam_20251119_141452
    // 格式：类型_日期(8位)_时间(6位)
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
      await window.api.video.create({
        path: p,
        name: f.name,
        size: f.size,
        camera:
          typeStr.toLowerCase() === 'bcam'
            ? 'mono'
            : typeStr.toLowerCase() === 'mcam'
              ? 'stereo'
              : 'unknown',
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
    // 保存成功后自动清空
    clearVideo()
  }
  if (fail > 0) {
    ElMessage.warning(`${fail} 个文件保存失败（命名或路径不符合要求）`)
  }
}

// Save videos but force camera type (mono/stereo/unknown)
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
      await window.api.video.create({
        path: p,
        name: f.name,
        size: f.size,
        // force camera value passed by caller
        camera: forceCamera,
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
      </div>
      <el-tabs v-model="activeTab" class="upload-tabs">
        <el-tab-pane label="视频上传" name="video">
          <div class="upload-inline">
            <div class="upload-box">
              <div class="el-upload__text">通过系统对话框选择本地视频文件（支持多选）</div>
              <div style="margin-top:12px; display:flex; gap:8px; align-items:center">
                <el-button type="primary" @click="selectVideosAndSave">选择文件</el-button>
                
                <el-button type="primary" @click="() => saveVideosWithCamera('mono')">保存为单目</el-button>
                <el-button type="primary" @click="() => saveVideosWithCamera('stereo')">保存为双目</el-button>
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
              <div class="el-upload__text">通过系统对话框选择本地 Excel 文件（支持多选）</div>
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
            <el-upload class="upload-box" drag action="#" :auto-upload="false" accept=".json,.csv"
              :on-change="onAlarmChange">
              <i class="el-icon-upload" />
              <div class="el-upload__text">拖拽到此或 <em>点击选择报警数据</em></div>
              <template #tip>
                <div class="el-upload__tip">
                  支持 JSON/CSV 报警数据格式，字段建议包含：id、time、level、content 等
                </div>
              </template>
            </el-upload>

            <div v-if="alarmFiles.length" class="upload-list">
              <div class="list-head">
                <span>已选择 {{ alarmFiles.length }} 个文件</span>
                <el-button text type="danger" @click="clearAlarm">清空</el-button>
              </div>
              <ul>
                <li v-for="f in alarmFiles" :key="'a:' + f.name + ':' + f.size">
                  <span class="name" :title="f.name">{{ f.name }}</span>
                  <span class="size">{{ (f.size / 1024).toFixed(1) }} KB</span>
                </li>
              </ul>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </section>
</template>

<style scoped src="./index.scss"></style>
