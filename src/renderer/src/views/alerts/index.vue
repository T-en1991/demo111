<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Picture, Calendar, Location, InfoFilled } from '@element-plus/icons-vue'

type DateRange = [Date, Date] | []

const now = new Date()
const defaultStart = new Date(now)
defaultStart.setDate(now.getDate() - 1)
defaultStart.setHours(0, 0, 0, 0)

const query = reactive({
  range: [defaultStart, now] as DateRange
})

const items = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(12)

function toFileUrl(p?: string | null): string | '' {
  if (!p) return ''
  const norm = p.replace(/\\/g, '/')
  return `http://localhost:18081/file?path=${encodeURIComponent(norm)}`
}

function toVideoUrl(p: string): string {
  const norm = p.replace(/\\/g, '/')
  return `http://localhost:18081/video?path=${encodeURIComponent(norm)}`
}

function formatTime(t: string | Date | null | undefined): string {
  if (!t) return ''
  const d = typeof t === 'string' ? new Date(t) : t
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

async function fetchAlerts(): Promise<void> {
  // @ts-ignore
  const params: any = { page: page.value, pageSize: pageSize.value }
  if (Array.isArray(query.range) && query.range.length === 2) {
    params.startTime = query.range[0].toISOString()
    params.endTime = query.range[1].toISOString()
  }
  // @ts-ignore
  const res = await window.api.alert.list(params)
  items.value = Array.isArray(res?.items) ? res.items : []
  total.value = Number(res?.total) || 0
}

function resetQuery(): void {
  query.range = []
}
async function applyQuery(): Promise<void> {
  await fetchAlerts()
}

onMounted(async () => {
  await fetchAlerts()
})

const videoDialogVisible = ref(false)
const activeTab = ref<'mono' | 'stereo'>('mono')
const monoUrl = ref<string>('')
const stereoUrl = ref<string>('')
const videoError = ref<string>('')

async function openVideo(item: any): Promise<void> {
  const moment = item?.createdAt ? String(item.createdAt) : ''
  if (!moment) return
  // @ts-ignore
  const res = await window.api.video.findByMoment(moment)
  monoUrl.value = res?.mono?.path ? toVideoUrl(String(res.mono.path)) : ''
  stereoUrl.value = res?.stereo?.path ? toVideoUrl(String(res.stereo.path)) : ''
  activeTab.value = monoUrl.value ? 'mono' : (stereoUrl.value ? 'stereo' : 'mono')
  videoError.value = ''
  videoDialogVisible.value = true
}

function onVideoError(e: Event): void {
  const el = e.target as HTMLVideoElement
  videoError.value = `无法播放：${el?.src || ''}`
}
</script>

<template>
  <section class="alerts-page">
    <header class="page-header">
      <h1>报警记录</h1>
      <p class="sub">支持条件过滤</p>
    </header>

    <el-card class="toolbar" shadow="hover">
      <el-form inline label-width="88px">
        <el-form-item label="时间范围">
          <el-date-picker v-model="query.range" type="daterange" range-separator="至" start-placeholder="开始日期"
            end-placeholder="结束日期" unlink-panels />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="applyQuery">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 图库展示 -->
    <el-card class="gallery-card" shadow="never">
      <div class="gallery-container">
        <div v-for="item in items" :key="item.id" class="gallery-item">
          <!-- 图片展示 -->
          <div class="image-wrapper">
            <el-image v-if="item.imgFile" :src="toFileUrl(item.imgFile)" fit="cover" class="gallery-image">
              <template #error>
                <div class="image-fallback">
                  <el-icon>
                    <Picture />
                  </el-icon>
                  <span>暂无图片</span>
                </div>
              </template>
            </el-image>
            <!-- 视频展示 -->
            <video v-else-if="false" src="" controls class="gallery-video"></video>
            <!-- 无媒体时的占位符 -->
            <div v-else class="image-fallback">
              <el-icon>
                <Picture />
              </el-icon>
              <span>暂无媒体</span>
            </div>
          </div>

          <!-- 信息展示 -->
          <div class="info-panel">
            <div class="info-item">
              <el-icon class="info-icon">
                <Calendar />
              </el-icon>
              <span class="info-label">时间：</span>
              <span class="info-value">{{ formatTime(item.createdAt) }}</span>
            </div>
            <div class="info-item">
              <el-icon class="info-icon">
                <Location />
              </el-icon>
              <span class="info-label">经纬度：</span>
              <span class="info-value">{{ item.lat?.toFixed(4) }}, {{ item.lon?.toFixed(4) }}</span>
            </div>
            <!-- <div class="info-item" v-if="item.message">
              <el-icon class="info-icon">
                <InfoFilled />
              </el-icon>
          <span class="info-label">内容：</span>
              <span class="info-value">{{ item.message }}</span>
            </div> -->
            <div style="margin-top:8px;">
              <el-button type="primary" size="small" @click="openVideo(item)">查看视频</el-button>
            </div>
          </div>
        </div>
      </div>
    </el-card>
    <el-dialog v-model="videoDialogVisible" title="查看视频" width="60%" append-to-body destroy-on-close>
      <el-tabs v-model="activeTab">
        <el-tab-pane label="单目" name="mono">
          <template v-if="monoUrl">
            <video :src="monoUrl" controls muted autoplay playsinline preload="metadata"
              style="width: 100%; max-height: 52vh; background: #000" @error="onVideoError"
              v-if="activeTab === 'mono'" />
          </template>
          <el-empty v-else description="未找到单目视频" />
        </el-tab-pane>
        <el-tab-pane label="双目" name="stereo">
          <template v-if="stereoUrl">
            <video :src="stereoUrl" controls muted autoplay playsinline preload="metadata"
              style="width: 100%; max-height: 52vh; background: #000" @error="onVideoError"
              v-if="activeTab === 'stereo'" />
          </template>
          <el-empty v-else description="未找到双目视频" />
        </el-tab-pane>
      </el-tabs>
      <div v-if="videoError" style="margin-top:8px;color:#f56c6c;">{{ videoError }}</div>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
