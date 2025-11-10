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
    content: '检测到滚转角超过阈值'
  },
  {
    id: 3,
    time: '2025-10-03 13:05',
    lon: 121.521,
    lat: 31.201,
    depth: 0,
    height: 0.8,
    battery: 90,
    signalStrength: -60,
    content: '已完成温度传感器校准'
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
    content: '设备温度达到 75℃，超过告警阈值',
    imgFile: 'https://picsum.photos/800/450',
    camMonoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
  },
  {
    id: 6,
    time: '2025-10-06 11:09',
    lon: 118.7969,
    lat: 32.0603,
    depth: 3.2,
    height: 1.7,
    battery: 88,
    signalStrength: -62,
    content: '巡检完成，状态正常'
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
  page.value = 1
}
function applyQuery(): void {
  activeRange.value = Array.isArray(query.range) && query.range.length === 2
    ? [query.range[0], query.range[1]]
    : []
  page.value = 1
}

const filtered = computed((): AlertItem[] => {
  return allAlerts.value.filter((a) => {
    const byRange = Array.isArray(activeRange.value) && activeRange.value.length === 2
      ? (() => {
          const t = new Date(a.time.replace(' ', 'T'))
          return t >= activeRange.value[0] && t <= activeRange.value[1]
        })()
      : true
    return byRange
  })
})

const page = ref(1)
const pageSize = ref(10)
const total = computed((): number => filtered.value.length)
const currentPageData = computed((): AlertItem[] => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

function onSizeChange(size: number): void { pageSize.value = size; page.value = 1 }
function onPageChange(p: number): void { page.value = p }

// 详情弹窗
const detailVisible = ref(false)
const detailItem = ref<AlertItem | null>(null)
const activeTab = ref('mono')
function openDetail(row: AlertItem): void {
  detailItem.value = row
  detailVisible.value = true
  activeTab.value = 'mono'
}
function closeDetail(): void { detailVisible.value = false }

function baiduMarkerUrl(lat: number, lon: number, title?: string, time?: string): string {
  const t = encodeURIComponent(title ?? '记录')
  const c = encodeURIComponent(time ?? '')
  // 使用无需AK的 marker 页面以 iframe 嵌入展示
  return `http://api.map.baidu.com/marker?location=${lat},${lon}&title=${t}&content=${c}&output=html&src=ocean-fish`
}

// 信号强度可视化（根据 dBm 映射 0-5 档）
function getSignalLevel(rssi?: number): number {
  if (rssi == null) return 0
  if (rssi >= -50) return 5
  if (rssi >= -60) return 4
  if (rssi >= -70) return 3
  if (rssi >= -80) return 2
  if (rssi >= -90) return 1
  return 0
}
function signalClass(rssi?: number): string {
  const lvl = getSignalLevel(rssi)
  if (lvl >= 4) return 'level-good'
  if (lvl === 3) return 'level-weak'
  return 'level-bad'
}

// 电量文本颜色提示
function batteryClass(percent?: number): string {
  if (percent == null) return ''
  if (percent >= 80) return 'text-good'
  if (percent < 20) return 'text-bad'
  return 'text-weak'
}
</script>

<template>
  <section class="alerts-page">
    <header class="page-header">
      <h1>历史记录</h1>
      <p class="sub">支持条件过滤与分页</p>
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

    <el-card class="table-card" shadow="never">
      <el-table :data="currentPageData" border stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="100" />
        <el-table-column prop="lon" label="经度" width="140" />
        <el-table-column prop="lat" label="纬度" width="140" />
        <el-table-column prop="depth" label="深度" width="120" />
        <el-table-column prop="height" label="高度" width="120" />
        <el-table-column label="电量(%)" width="180">
          <template #default="{ row }">
            <el-progress :percentage="row.battery ?? 0" :stroke-width="10"
              :status="row.battery != null && row.battery < 20 ? 'exception' : (row.battery != null && row.battery >= 80 ? 'success' : undefined)" />
          </template>
        </el-table-column>
        <el-table-column label="信号强度(dBm)" width="200">
          <template #default="{ row }">
            <div class="signal-cell">
              <span class="signal-bars" :class="signalClass(row.signalStrength)">
                <span v-for="i in 5" :key="i" class="bar" :class="{ 'is-on': i <= getSignalLevel(row.signalStrength) }"></span>
              </span>
              <span class="signal-text">{{ row.signalStrength ?? '-' }} dBm</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="time" label="时间" width="180" />
        <el-table-column prop="content" label="报警内容" min-width="240" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          :page-sizes="[10, 20, 50]"
          @size-change="onSizeChange"
          @current-change="onPageChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailVisible" width="80vw" class="history-dialog">
      <template #header>
        <div class="detail-header">
          <div class="line1">
            <span class="content" :title="detailItem?.content ?? ''">{{ detailItem?.content ?? '记录详情' }}</span>
            <span class="time">{{ detailItem?.time }}</span>
          </div>
          <div class="meta-line">
            <span class="meta-item">ID: {{ detailItem?.id }}</span>
            <span class="sep">•</span>
            <span class="meta-item">经度: {{ detailItem?.lon ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">纬度: {{ detailItem?.lat ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">深度: {{ detailItem?.depth ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">高度: {{ detailItem?.height ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">电量: <span :class="batteryClass(detailItem?.battery)">{{ detailItem?.battery ?? '-' }}%</span></span>
            <span class="sep">•</span>
            <span class="meta-item">信号: <span :class="signalClass(detailItem?.signalStrength)">{{ detailItem?.signalStrength ?? '-' }} dBm</span></span>
          </div>
        </div>
      </template>

      <div class="map-pane" style="margin-top: 8px">
        <div v-if="detailItem?.lat != null && detailItem?.lon != null">
          <iframe
            :src="baiduMarkerUrl(detailItem!.lat!, detailItem!.lon!, detailItem!.content, detailItem!.time)"
            style="width: 100%; height: 420px; border: 0; border-radius: 8px;"
          />
        </div>
        <el-empty v-else description="暂无坐标信息，无法在地图上标注" />
      </div>

      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane label="单目摄像头" name="mono">
          <div class="video-pane">
            <template v-if="detailItem?.camMonoUrl">
              <video :src="detailItem!.camMonoUrl!" controls muted autoplay playsinline style="width: 100%; max-height: 420px; background: #000;" />
            </template>
            <el-empty v-else description="暂无单目摄像头视频流" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="双目摄像头" name="stereo">
          <div class="video-pane">
            <template v-if="detailItem?.camStereoUrl">
              <video :src="detailItem!.camStereoUrl!" controls muted autoplay playsinline style="width: 100%; max-height: 420px; background: #000;" />
            </template>
            <el-empty v-else description="暂无双目摄像头视频流" />
          </div>
        </el-tab-pane>

        <el-tab-pane label="图片" name="image">
          <template v-if="detailItem?.imgFile">
            <el-image :src="detailItem!.imgFile!" fit="contain" style="width: 100%; max-height: 420px; border-radius: 8px;" />
          </template>
          <el-empty v-else description="暂无图片" />
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="closeDetail">关闭</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>