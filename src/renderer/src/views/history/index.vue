<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

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
  rawLine?: string
}

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

// 分页相关
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)

// 历史记录列表
const allItems = ref<AlertItem[]>([])

// 本地时区格式化（YYYY-MM-DD HH:mm:ss）
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

// 从数据库获取历史记录
async function fetchData(): Promise<void> {
  loading.value = true
  try {
    // 准备查询参数
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      startTime: activeRange.value.length === 2 ? formatDate(activeRange.value[0]) : undefined,
      endTime: activeRange.value.length === 2 ? formatDate(activeRange.value[1]) : undefined
    }

    // 只获取历史记录
    const historyResult = await window.api.history.list(params)

    // 格式化历史记录
    const historyItems: AlertItem[] = historyResult.items.map((item: any) => ({
      id: item.id,
      lon: item.lon,
      lat: item.lat,
      depth: item.depth,
      height: item.height,
      battery: item.battery,
      signalStrength: item.signalStrength,
      time: formatDate(new Date(item.time)),
      content: item.content,
      rawLine: item.rawLine
    }))

    // 按时间倒序排序
    allItems.value = historyItems.sort((a, b) => {
      return new Date(b.time).getTime() - new Date(a.time).getTime()
    })

    // 计算总数
    total.value = historyResult.total
  } catch (error) {
    console.error('Failed to fetch data:', error)
    ElMessage.error('获取数据失败')
  } finally {
    loading.value = false
  }
}

// 当前页数据（不需要筛选，因为已经只获取了历史记录）
const currentPageData = computed((): AlertItem[] => {
  return allItems.value
})

function resetQuery(): void {
  query.range = []
  activeRange.value = []
  page.value = 1
  fetchData()
}
function applyQuery(): void {
  activeRange.value =
    Array.isArray(query.range) && query.range.length === 2 ? [query.range[0], query.range[1]] : []
  page.value = 1
  fetchData()
}

function onSizeChange(size: number): void {
  pageSize.value = size
  page.value = 1
  fetchData()
}

function onPageChange(p: number): void {
  page.value = p
  fetchData()
}

// 详情弹窗
const detailVisible = ref(false)
const detailItem = ref<AlertItem | null>(null)
const activeTab = ref('mono')
const monoUrl = ref('')
const stereoUrl = ref('')

function toVideoUrl(p: string): string {
  const norm = p.replace(/\\/g, '/')
  return `http://localhost:18081/video?path=${encodeURIComponent(norm)}`
}

function openDetail(row: AlertItem): void {
  console.debug('openDetail', row)
  detailItem.value = row
  detailVisible.value = true
  activeTab.value = 'mono'
  monoUrl.value = ''
  stereoUrl.value = ''
  window.api.video
    .findByMoment(row.time)
    .then((res) => {
      if (res?.mono?.path) monoUrl.value = toVideoUrl(res.mono.path)
      if (res?.stereo?.path) stereoUrl.value = toVideoUrl(res.stereo.path)
      if (!monoUrl.value && stereoUrl.value) activeTab.value = 'stereo'
    })
    .catch((e) => {
      console.error('findByMoment failed', e)
    })
}

function closeDetail(): void {
  detailVisible.value = false
}

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

// 组件挂载时获取数据
onMounted(() => {
  fetchData()
})
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
          <el-date-picker v-model="query.range" type="daterange" range-separator="至" start-placeholder="开始日期"
            end-placeholder="结束日期" unlink-panels />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="applyQuery">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="currentPageData" border stripe style="width: 100%" v-loading="loading" height="560">

        <el-table-column prop="id" label="ID" />
        <el-table-column prop="lon" label="经度" />
        <el-table-column prop="lat" label="纬度" />
        <el-table-column prop="depth" label="深度" />
        <el-table-column prop="height" label="高度" />
        <el-table-column prop="rollAngle" label="横滚角" />
        <el-table-column prop="pitchAngle" label="俯仰角" />
        <el-table-column prop="yawAngle" label="航向角" />
        <el-table-column prop="battery" label="电量" />
        <el-table-column prop="signalStrength" label="信号强度" />
        <!-- <el-table-column prop="content" label="内容" min-width="240" /> -->
        <el-table-column prop="time" label="时间" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination">
        <el-pagination background layout="total, sizes, prev, pager, next, jumper" :total="total" :page-size="pageSize"
          :current-page="page" :page-sizes="[10, 20, 50]" @size-change="onSizeChange" @current-change="onPageChange" />
      </div>
    </el-card>

    <el-dialog v-model="detailVisible" width="80vw" class="history-dialog" append-to-body destroy-on-close>
      <template #header>
        <div class="detail-header">
          <div class="line1">
            <span class="content" :title="detailItem?.content ?? ''">{{
              detailItem?.content ?? '记录详情'
            }}</span>
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
            <span class="meta-item">电量:
              <span :class="batteryClass(detailItem?.battery)">{{ detailItem?.battery ?? '-' }}%</span></span>
            <span class="sep">•</span>
            <span class="meta-item">信号:
              <span :class="signalClass(detailItem?.signalStrength)">{{ detailItem?.signalStrength ?? '-' }}
                dBm</span></span>
          </div>
        </div>
      </template>

      <div class="video-pane" style="margin-top: 8px">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="单目" name="mono">
            <template v-if="monoUrl">
              <video :src="monoUrl" controls autoplay style="width: 100%; max-height: 52vh; background: #000" />
            </template>
            <el-empty v-else description="未找到单目视频" />
          </el-tab-pane>
          <el-tab-pane label="双目" name="stereo">
            <template v-if="stereoUrl">
              <video :src="stereoUrl" controls autoplay style="width: 100%; max-height: 52vh; background: #000" />
            </template>
            <el-empty v-else description="未找到双目视频" />
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- <div class="map-pane" style="margin-top: 8px">
        <div v-if="detailItem?.lat != null && detailItem?.lon != null">
          <iframe :src="baiduMarkerUrl(
            detailItem!.lat!,
            detailItem!.lon!,
            detailItem!.content,
            detailItem!.time
          )
            " style="width: 100%; height: 420px; border: 0; border-radius: 8px" />
        </div>
        <el-empty v-else description="暂无坐标信息，无法在地图上标注" />
      </div> -->
      <template #footer>
        <el-button @click="closeDetail">关闭</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
