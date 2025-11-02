<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { loadBMapGL } from '../../utils/baiduMap'
import { loadOfflineBMap } from '../../utils/offlineBMap'

const AK = 'iWyOxtxr32YCdQBu9yYeICmRKBb6Jm1h'

// 最小类型定义，覆盖当前使用到的构造与方法，避免使用 any
type BMapLikeMap = {
  centerAndZoom: (point: unknown, zoom: number) => void
  enableScrollWheelZoom: (enable: boolean) => void
  addControl: (control: unknown) => void
  addEventListener: (name: string, handler: (e: { point: { lng: number; lat: number } }) => void) => void
  addOverlay: (overlay: unknown) => void
}

interface BMap2DApi {
  Map: new (container: string | HTMLElement) => BMapLikeMap
  Point: new (lng: number, lat: number) => unknown
  NavigationControl: new () => unknown
  ScaleControl: new () => unknown
  Marker: new (point: unknown) => unknown
}

type SignalLevel = 'strong' | 'medium' | 'weak'
interface RobotStatus {
  id: string
  name: string
  battery: number // %
  depth: number // m
  yaw: number // °
  pitch: number // °
  roll: number // °
  lng: number
  lat: number
  acoustic: SignalLevel
}

const robots = reactive<RobotStatus[]>([
  { id: 'A1', name: '水下机器人 A1', battery: 98, depth: 100, yaw: 260, pitch: 15, roll: 2, lng: 116.404, lat: 39.915, acoustic: 'strong' },
  { id: 'B2', name: '水下机器人 B2', battery: 86, depth: 80, yaw: 120, pitch: 8, roll: 5, lng: 121.4737, lat: 31.2304, acoustic: 'medium' },
  { id: 'C3', name: '水下机器人 C3', battery: 72, depth: 60, yaw: 45, pitch: 12, roll: 3, lng: 113.2644, lat: 23.1291, acoustic: 'weak' }
])
const selectedId = ref<string>(robots[0].id)
const current = computed<RobotStatus | undefined>(() => robots.find(r => r.id === selectedId.value))
// 为模板提供已解包的派生值，避免在模板中直接访问 ComputedRef 成员导致类型提示报错
const currentLng = computed<number>(() => current.value?.lng ?? 0)
const currentLat = computed<number>(() => current.value?.lat ?? 0)
const currentDepth = computed<number>(() => current.value?.depth ?? 0)
const currentBattery = computed<number>(() => current.value?.battery ?? 0)
const currentYaw = computed<number>(() => current.value?.yaw ?? 0)
const currentPitch = computed<number>(() => current.value?.pitch ?? 0)
const currentRoll = computed<number>(() => current.value?.roll ?? 0)
const currentAcoustic = computed<SignalLevel>(() => current.value?.acoustic ?? 'weak')
let mapInstance: BMapLikeMap | null = null
function getBMap(): BMap2DApi | undefined {
  return (window as { BMap?: unknown }).BMap as BMap2DApi | undefined
}

// 记录每个设备的初始位置与初始深度，供“返航/初始定高”使用
const homes: Record<string, { lng: number; lat: number }> = {}
const initialDepths: Record<string, number> = {}
robots.forEach(r => {
  homes[r.id] = { lng: r.lng, lat: r.lat }
  initialDepths[r.id] = r.depth
})

// 控制台交互（示例逻辑，可替换为与设备通讯的指令）
function ascend(): void {
  const r = current.value
  if (!r) return
  r.depth = Math.max(0, r.depth - 5)
  ElMessage.success(`上浮：当前深度 ${r.depth}m`)
}
function descend(): void {
  const r = current.value
  if (!r) return
  r.depth = r.depth + 5
  ElMessage.success(`下潜：当前深度 ${r.depth}m`)
}
function returnHome(): void {
  const r = current.value
  const BMap = getBMap()
  if (!r || !BMap || !mapInstance) return
  const home = homes[r.id]
  if (!home) return
  r.lng = home.lng
  r.lat = home.lat
  const point = new BMap.Point(home.lng, home.lat)
  mapInstance.centerAndZoom(point, 12)
  mapInstance.addOverlay(new BMap.Marker(point))
  ElMessage.success('返航：已定位至初始位置')
}
function altitudeHold(): void {
  const r = current.value
  if (!r) return
  const init = initialDepths[r.id] ?? r.depth
  r.depth = init
  ElMessage.success(`初始定高：目标深度 ${init}m`)
}

// 报警信息数据结构与示例
type AlertLevel = '高' | '中' | '低'
interface AlertItem {
  id: string
  time: string
  lng: number
  lat: number
  level: AlertLevel
}

const alerts = reactive<AlertItem[]>([
  { id: 'al-1', time: new Date().toISOString(), lng: robots[0].lng + 0.0012, lat: robots[0].lat + 0.0012, level: '高' },
  { id: 'al-2', time: new Date(Date.now() - 30 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0008, lat: robots[0].lat - 0.0006, level: '中' },
  { id: 'al-3', time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng + 0.0024, lat: robots[0].lat - 0.0014, level: '低' },
  { id: 'al-4', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' },
    { id: 'al-5', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' },
    { id: 'al-6', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' },
  { id: 'al-7', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' },
  { id: 'al-8', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' },
  { id: 'al-9', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' },
  { id: 'al-10', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' },
  { id: 'al-11', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' },
  { id: 'al-12', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), lng: robots[0].lng - 0.0032, lat: robots[0].lat + 0.0022, level: '中' }

])

function levelClass(level: AlertLevel): string {
  return level === '高' ? 'lv-high' : level === '中' ? 'lv-mid' : 'lv-low'
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const s = String(d.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}:${s}`
  } catch (err) {
    void err
    return iso
  }
}

function focusAlert(a: AlertItem): void {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const point = new BMap.Point(a.lng, a.lat)
  mapInstance.centerAndZoom(point, 14)
  const marker = new BMap.Marker(point)
  mapInstance.addOverlay(marker)
}

onMounted(async () => {
  try {
    type GlobalCfg = { __MAP_MODE?: string }
    const globalCfg = window as unknown as GlobalCfg
    const useOffline =
      !navigator.onLine || globalCfg.__MAP_MODE === 'offline' || localStorage.getItem('MAP_MODE') === 'offline'
    if (useOffline) {
      await loadOfflineBMap()
    } else {
      await loadBMapGL(AK)
    }

    const BMap = (window as { BMap?: unknown }).BMap as BMap2DApi | undefined
    if (BMap) {
      const container = document.getElementById('bmap-container') as HTMLElement | null
      if (!container) {
        console.error('Baidu Map container not found')
        return
      }
      const map = new BMap.Map(container)
      mapInstance = map
      const start = current.value || robots[0]
      const center = new BMap.Point(start.lng, start.lat)
      map.centerAndZoom(center, 12)
      map.enableScrollWheelZoom(true)
      map.addControl(new BMap.NavigationControl())
      map.addControl(new BMap.ScaleControl())

      // 支持点击标注，并提示经纬度
      map.addEventListener('click', (e: { point: { lng: number; lat: number } }) => {
        const pt = e.point
        const marker = new BMap.Marker(new BMap.Point(pt.lng, pt.lat))
        map.addOverlay(marker)
        if (current.value) {
          current.value.lng = pt.lng
          current.value.lat = pt.lat
        }
        ElMessage.success(`经度: ${pt.lng}, 纬度: ${pt.lat}`)
        console.log('Clicked at:', pt.lng, pt.lat)
      })
    } else {
      console.error('Baidu Map API not available after load')
    }
  } catch (e) {
    console.error('Baidu Map load failed:', e)
  }
})

watch(selectedId, (id) => {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const r = robots.find(r => r.id === id)
  if (!r) return
  mapInstance.centerAndZoom(new BMap.Point(r.lng, r.lat), 12)
})
</script>

<template>
  <section class="screen">
    <div class="layout">
      <div class="map-panel">
        <div id="bmap-container" class="bmap"></div>
      </div>
      <div class="side-panel">
        <div class="panel-card">
          <div class="section-title">基本信息</div>
          <div class="panel-header single-select">
            <el-select v-model="selectedId" size="large" class="robot-select" placeholder="选择机器人">
              <el-option v-for="r in robots" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
          </div>
          <div class="status-grid">
            <div class="stat-card">
              <div class="stat-value">{{ Number(currentLng).toFixed(6) }}°</div>
              <div class="stat-label">经</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ Number(currentLat).toFixed(6) }}°</div>
              <div class="stat-label">纬</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentDepth }}m</div>
              <div class="stat-label">深度</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentBattery }}%</div>
              <div class="stat-label">电量</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentYaw }}°</div>
              <div class="stat-label">偏航角</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentPitch }}°</div>
              <div class="stat-label">俯仰角</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentRoll }}°</div>
              <div class="stat-label">横滚角</div>
            </div>
            <div class="stat-card signal">
              <div class="stat-value">
                <span :class="['sig', currentAcoustic === 'strong' ? 's-strong' : currentAcoustic === 'medium' ? 's-medium' : 's-weak']">
                  {{ currentAcoustic === 'strong' ? '强' : currentAcoustic === 'medium' ? '中' : '弱' }}
                </span>
              </div>
              <div class="stat-label">声通信号强度</div>
            </div>
          </div>
        </div>

        <div class="panel-card alerts-card">
          <div class="section-title">报警信息</div>
          <div class="alerts-list">
            <div class="alert-card" v-for="(a, i) in alerts" :key="a.id" @click="focusAlert(a)">
              <div class="alert-index"><span>{{ i + 1 }}</span></div>
              <div class="alert-main">
                <div class="alert-title">{{ formatTime(a.time) }}</div>
                <div class="alert-sub">经度 {{ Number(a.lng).toFixed(6) }} · 纬度 {{ Number(a.lat).toFixed(6) }}</div>
              </div>
              <div class="alert-level" :class="levelClass(a.level)">{{ a.level }}</div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="section-title">控制台</div>
          <div class="console-grid">
            <div class="ctrl-btn" @click="ascend"><span class="icon">↑</span><span class="text">上浮</span></div>
            <div class="ctrl-btn" @click="descend"><span class="icon">↓</span><span class="text">下潜</span></div>
            <div class="ctrl-btn" @click="returnHome"><span class="icon">↩</span><span class="text">返航</span></div>
            <div class="ctrl-btn" @click="altitudeHold"><span class="icon">⤓</span><span class="text">初始定高</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>

</template>

<style lang="scss" scoped src="./index.scss"></style>
