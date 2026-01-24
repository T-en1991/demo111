<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface AlertItem {
  id: number
  fishId?: number
  fishName?: string
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

// 机器鱼筛选
interface Fish {
  id: number
  name: string
  acousticId: string
}
const fishList = ref<Fish[]>([])
const selectedFishId = ref<number | undefined>(undefined)

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
      endTime: activeRange.value.length === 2 ? formatDate(activeRange.value[1]) : undefined,
      fishId: selectedFishId.value
    }

    // 只获取历史记录
    const historyResult = await window.api.history.list(params)

    // 格式化历史记录
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historyItems: AlertItem[] = historyResult.items.map((item: any) => {
      const foundFish = fishList.value.find((f) => f.id === item.fishId)
      return {
        id: item.id,
        fishId: item.fishId,
        fishName: foundFish ? foundFish.name : (item.fishId ? `Fish #${item.fishId}` : '-'),
        lon: item.lon,
        lat: item.lat,
        depth: item.depth,
        height: item.height,
        battery: item.battery,
        signalStrength: item.signalStrength,
        rollAngle: item.rollDeg,
        pitchAngle: item.pitchDeg,
        yawAngle: item.yawDeg,
        time: formatDate(new Date(item.time)),
        content: item.content,
        rawLine: item.rawLine
      }
    })

    // 按时间倒序排序
    allItems.value = historyItems.sort((a, b) => {
      return new Date(b.time).getTime() - new Date(a.time).getTime()
    })

    // 计算总数
    total.value = historyResult.total
  } catch (error) {
    console.error('Failed to fetch data:', error)
    ElMessage.error(t('history.fetchFail'))
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
  // selectedFishId.value = undefined
  // Default to first fish if available
  if (fishList.value.length > 0) {
    selectedFishId.value = fishList.value[0].id
  } else {
    selectedFishId.value = undefined
  }
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
onMounted(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fishList.value = (await window.api.fish.findAll()) as any[]
    if (fishList.value.length > 0) {
      selectedFishId.value = fishList.value[0].id
    }
  } catch (e) {
    console.error('Failed to load fish list', e)
  }
  fetchData()
})
</script>

<template>
  <section class="alerts-page">
    <header class="page-header">
      <h1>{{ t('history.title') }}</h1>
      <p class="sub">{{ t('history.sub') }}</p>
    </header>

    <el-card class="toolbar" shadow="hover">
      <el-form inline label-width="88px">
        <el-form-item label="机器鱼">
          <el-select v-model="selectedFishId" placeholder="全部" clearable style="width: 160px">
            <el-option
              v-for="fish in fishList"
              :key="fish.id"
              :label="fish.name + (fish.acousticId ? ` (ID:${fish.acousticId})` : '')"
              :value="fish.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('history.timeRange')">
          <el-date-picker v-model="query.range" type="daterange" range-separator="-" :start-placeholder="t('history.startDate')"
            :end-placeholder="t('history.endDate')" unlink-panels />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="applyQuery">{{ t('history.query') }}</el-button>
          <el-button @click="resetQuery">{{ t('history.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table :data="currentPageData" border stripe style="width: 100%" v-loading="loading" height="560">
        <el-table-column prop="fishName" :label="t('fish.name')" min-width="120" />
        <el-table-column prop="lon" :label="t('history.lon')" />
        <el-table-column prop="lat" :label="t('history.lat')" />
        <el-table-column prop="depth" :label="t('history.depth')" />
        <el-table-column prop="height" :label="t('history.height')" />
        <el-table-column prop="rollAngle" :label="t('history.roll')" />
        <el-table-column prop="pitchAngle" :label="t('history.pitch')" />
        <el-table-column prop="yawAngle" :label="t('history.yaw')" />
        <el-table-column prop="battery" :label="t('history.battery')" />
        <el-table-column prop="signalStrength" :label="t('history.signal')" />
        <!-- <el-table-column prop="content" label="内容" min-width="240" /> -->
        <el-table-column prop="time" :label="t('history.time')" />
        <el-table-column :label="t('common.operation')" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" plain @click="openDetail(row)">{{ t('common.detail') }}</el-button>
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
              detailItem?.content ?? t('history.detailTitle')
            }}</span>
            <span class="time">{{ detailItem?.time }}</span>
          </div>
          <div class="meta-line">
            <span class="meta-item">{{ t('fish.name') }}: {{ detailItem?.fishName ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">{{ t('history.id') }}: {{ detailItem?.id }}</span>
            <span class="sep">•</span>
            <span class="meta-item">{{ t('history.lon') }}: {{ detailItem?.lon ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">{{ t('history.lat') }}: {{ detailItem?.lat ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">{{ t('history.depth') }}: {{ detailItem?.depth ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">{{ t('history.height') }}: {{ detailItem?.height ?? '-' }}</span>
            <span class="sep">•</span>
            <span class="meta-item">{{ t('history.battery') }}:
              <span :class="batteryClass(detailItem?.battery)">{{ detailItem?.battery ?? '-' }}%</span></span>
            <span class="sep">•</span>
            <span class="meta-item">{{ t('history.signal') }}:
              <span :class="signalClass(detailItem?.signalStrength)">{{ detailItem?.signalStrength ?? '-' }}
                dBm</span></span>
          </div>
        </div>
      </template>

      <div class="video-pane" style="margin-top: 8px">
        <el-tabs v-model="activeTab">
          <el-tab-pane :label="t('history.mono')" name="mono">
            <template v-if="monoUrl">
              <video :src="monoUrl" controls autoplay style="width: 100%; max-height: 52vh; background: #000" />
            </template>
            <el-empty v-else :description="t('history.noMono')" />
          </el-tab-pane>
          <el-tab-pane :label="t('history.stereo')" name="stereo">
            <template v-if="stereoUrl">
              <video :src="stereoUrl" controls autoplay style="width: 100%; max-height: 52vh; background: #000" />
            </template>
            <el-empty v-else :description="t('history.noStereo')" />
          </el-tab-pane>
        </el-tabs>
      </div>

      <template #footer>
        <el-button @click="closeDetail">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
