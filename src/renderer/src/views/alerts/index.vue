<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

interface AlertItem {
  id: number
  lon?: number
  lat?: number
  depth?: number
  height?: number
  battery?: number
  signalStrength?: number
  type: '报警'
  time: string
  content?: string
  imgFile?: string
  camMonoUrl?: string
  camStereoUrl?: string
}



const allAlerts = ref<AlertItem[]>([
  {
    id: 1,
    time: '2025-10-02 10:12',
    lon: 121.4737,
    lat: 31.2304,
    depth: 12.3,
    height: 4.5,
    battery: 15,
    signalStrength: -68,
    type: '报警',
    content: '电池电量降至 15%，请尽快充电',
    camStereoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
  },
  {
    id: 2,
    time: '2025-10-03 08:40',
    lon: 114.0579,
    lat: 22.5431,
    depth: 8.1,
    height: 3.9,
    battery: 82,
    signalStrength: -55,
    type: '报警',
    content: '检测到滚转角超过阈值'
  },
  {
    id: 4,
    time: '2025-10-04 09:33',
    lon: 116.4074,
    lat: 39.9042,
    depth: 5.6,
    height: 2.2,
    battery: 70,
    signalStrength: -75,
    type: '报警',
    content: '短时通信丢失约 30s'
  },
  {
    id: 5,
    time: '2025-10-05 15:21',
    lon: 120.19,
    lat: 30.26,
    depth: 9.7,
    height: 3.1,
    battery: 40,
    signalStrength: -80,
    type: '报警',
    content: '设备温度达到 75℃，超过告警阈值',
    imgFile: 'https://picsum.photos/800/450',
    camMonoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
  }
])



// 默认时间范围：昨天零点 到 今天此时此刻
const now = new Date()
const defaultStart = new Date(now)
defaultStart.setDate(now.getDate() - 1)
defaultStart.setHours(0, 0, 0, 0)
type DateRange = [Date, Date] | []
const query = reactive({
  range: [defaultStart, now] as DateRange
})
// 仅在点击“查询”后应用筛选的有效范围（默认采用昨天零点到现在）
const activeRange = ref<DateRange>([defaultStart, now] as DateRange)

function resetQuery(): void {
  query.range = []
  activeRange.value = []
}
function applyQuery(): void {
  activeRange.value =
    Array.isArray(query.range) && query.range.length === 2 ? [query.range[0], query.range[1]] : []
}

const filtered = computed((): AlertItem[] => {
  return allAlerts.value
    .filter((a) => {
      const byRange =
        Array.isArray(activeRange.value) && activeRange.value.length === 2
          ? (() => {
              const t = new Date(a.time.replace(' ', 'T'))
              return t >= activeRange.value[0] && t <= activeRange.value[1]
            })()
          : true
      return byRange
    })
    .sort((a, b) => {
      // 按时间倒序排序
      const timeA = new Date(a.time.replace(' ', 'T')).getTime()
      const timeB = new Date(b.time.replace(' ', 'T')).getTime()
      return timeB - timeA
    })
})




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
          <el-date-picker
            v-model="query.range"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            unlink-panels
          />
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
        <div 
          v-for="item in filtered" 
          :key="item.id"
          class="gallery-item"
        >
          <!-- 图片展示 -->
          <div class="image-wrapper">
            <el-image
              v-if="item.imgFile"
              :src="item.imgFile"
              fit="cover"
              class="gallery-image"
            >
              <template #error>
                <div class="image-fallback">
                  <el-icon><Picture /></el-icon>
                  <span>暂无图片</span>
                </div>
              </template>
            </el-image>
            <!-- 视频展示 -->
            <video 
              v-else-if="item.camMonoUrl || item.camStereoUrl"
              :src="item.camMonoUrl || item.camStereoUrl"
              controls
              class="gallery-video"
            ></video>
            <!-- 无媒体时的占位符 -->
            <div v-else class="image-fallback">
              <el-icon><Picture /></el-icon>
              <span>暂无媒体</span>
            </div>
          </div>
          
          <!-- 信息展示 -->
          <div class="info-panel">
            <div class="info-item">
              <el-icon class="info-icon"><Calendar /></el-icon>
              <span class="info-label">时间：</span>
              <span class="info-value">{{ item.time }}</span>
            </div>
            <div class="info-item">
              <el-icon class="info-icon"><Location /></el-icon>
              <span class="info-label">经纬度：</span>
              <span class="info-value">{{ item.lat?.toFixed(4) }}, {{ item.lon?.toFixed(4) }}</span>
            </div>
            <div class="info-item" v-if="item.content">
              <el-icon class="info-icon"><InfoFilled /></el-icon>
              <span class="info-label">内容：</span>
              <span class="info-value">{{ item.content }}</span>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
