<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { loadBMapGL } from '../../utils/baiduMap'
import { loadOfflineBMap } from '../../utils/offlineBMap'

const AK = 'iWyOxtxr32YCdQBu9yYeICmRKBb6Jm1h'
// 使用项目静态资源作为标注图标
const fishIconUrl = new URL('../../assets/images/fish.svg', import.meta.url).href

// 最小类型定义，覆盖当前使用到的构造与方法，避免使用 any
type BMapLikeMap = {
  centerAndZoom: (point: unknown, zoom: number) => void
  enableScrollWheelZoom: (enable: boolean) => void
  addControl: (control: unknown) => void
  addEventListener: (name: string, handler: (e: { point: { lng: number; lat: number } }) => void) => void
  addOverlay: (overlay: unknown) => void
  removeOverlay: (overlay: unknown) => void
  setMapType?: (type: unknown) => void
}

interface BMap2DApi {
  Map: new (container: string | HTMLElement) => BMapLikeMap
  Point: new (lng: number, lat: number) => unknown
  NavigationControl: new () => unknown
  ScaleControl: new () => unknown
  Marker: new (point: unknown, opts?: unknown) => unknown
  Icon: new (url: string, size?: unknown, opts?: unknown) => unknown
  Size: new (w: number, h: number) => unknown
  Polyline: new (points: unknown[], opts?: unknown) => unknown
}

type SignalLevel = 'strong' | 'medium' | 'weak'
interface RobotStatus {
  id: string
  name: string
  battery: number // %
  depth: number // m
  altitude: number // m
  yaw: number // °
  pitch: number // °
  roll: number // °
  lng: number
  lat: number
  acoustic: SignalLevel
}

const robots = reactive<RobotStatus[]>([
  { id: 'A1', name: '水下机器人 A1', battery: 98, depth: 100, altitude: 5, yaw: 260, pitch: 15, roll: 2, lng: 116.404, lat: 39.915, acoustic: 'strong' },
  { id: 'B2', name: '水下机器人 B2', battery: 86, depth: 80, altitude: 8, yaw: 120, pitch: 8, roll: 5, lng: 121.4737, lat: 31.2304, acoustic: 'medium' },
  { id: 'C3', name: '水下机器人 C3', battery: 72, depth: 60, altitude: 3, yaw: 45, pitch: 12, roll: 3, lng: 113.2644, lat: 23.1291, acoustic: 'weak' }
])
const selectedId = ref<string>(robots[0].id)
const current = computed<RobotStatus | undefined>(() => robots.find(r => r.id === selectedId.value))
// 为模板提供已解包的派生值，避免在模板中直接访问 ComputedRef 成员导致类型提示报错
const currentLng = computed<number>(() => current.value?.lng ?? 0)
const currentLat = computed<number>(() => current.value?.lat ?? 0)
const currentDepth = computed<number>(() => current.value?.depth ?? 0)
const currentAltitude = computed<number>(() => current.value?.altitude ?? 0)
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
robots.forEach((r): void => {
  homes[r.id] = { lng: r.lng, lat: r.lat }
  initialDepths[r.id] = r.depth
})

// 控制台交互（示例逻辑，可替换为与设备通讯的指令）·
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
function moveForward(): void { console.log('[tap] forward') }
function moveBackward(): void { console.log('[tap] backward') }
function moveLeft(): void { console.log('[tap] left') }
function moveRight(): void { console.log('[tap] right') }
// 已移除“返航/初始定高”按钮与方法（保留示例方向与深度控制）

// 按住持续触发：每 100ms 执行一次并打印日志
type HoldAction = 'forward' | 'backward' | 'left' | 'right' | 'ascend' | 'descend'
const holdTimers: Partial<Record<HoldAction, number>> = {}
function execAction(action: HoldAction): void {
  switch (action) {
    case 'forward':
      moveForward();
      break
    case 'backward':
      moveBackward();
      break
    case 'left':
      moveLeft();
      break
    case 'right':
      moveRight();
      break
    case 'ascend':
      ascend();
      break
    case 'descend':
      descend();
      break
  }
  console.log(`[hold] ${action}`)
}
function pressStart(action: HoldAction): void {
  if (holdTimers[action] != null) return
  holdTimers[action] = window.setInterval((): void => {
    execAction(action)
  }, 100)
}
function pressStop(action: HoldAction): void {
  const t = holdTimers[action]
  if (t != null) {
    clearInterval(t)
    delete holdTimers[action]
  }
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
  console.log(a)
  // const BMap = getBMap()
  // if (!BMap || !mapInstance) return
  // const point = new BMap.Point(a.lng, a.lat)
  // mapInstance.centerAndZoom(point, 14)
  // 点击报警只定位，不在地图上新增任何标注
}


// 路径折线与当前位置标注引用，便于更新与移除
let routeOverlay: unknown | null = null
let currentMarker: unknown | null = null
let pollTimer: number | null = null

// 视频弹窗状态
type VideoMode = 'mono' | 'stereo'
const videoDialogVisible = ref(false)
const videoMode = ref<VideoMode>('mono')
const videoUrls = reactive<Record<string, { mono?: string; stereo?: string }>>({})
// 示例视频地址映射（用于“假的观看效果”）
videoUrls['A1'] = {
  mono: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  stereo: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4'
}
videoUrls['B2'] = {
  mono: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  stereo: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
}
videoUrls['C3'] = {
  mono: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  stereo: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4'
}
const currentVideoTitle = computed((): string => '实时视频')
const currentVideoUrl = computed((): string | undefined => {
  const vs = videoUrls[selectedId.value] ?? {}
  return videoMode.value === 'mono' ? vs.mono : vs.stereo
})
function openVideo(mode: VideoMode): void {
  videoMode.value = mode
  videoDialogVisible.value = true
}

type RoutePoint = { lng: number; lat: number; altitude: number; depth: number }

function setCurrentMarker(lng: number, lat: number, size = 32): void {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const point = new BMap.Point(lng, lat)
  if (currentMarker && typeof mapInstance.removeOverlay === 'function') {
    mapInstance.removeOverlay(currentMarker)
  }
  const icon = new BMap.Icon(
    fishIconUrl,
    new BMap.Size(size, size),
    { imageSize: new BMap.Size(size, size), anchor: new BMap.Size(Math.round(size / 2), Math.round(size / 2)) }
  )
  currentMarker = new BMap.Marker(point, { icon })
  mapInstance.addOverlay(currentMarker)
  // 点击鱼标注，打开视频弹窗（默认单目）
  try {
    (currentMarker as { addEventListener?: (type: string, handler: () => void) => void }).addEventListener?.('click', (): void => {
      openVideo('mono')
    })
  } catch (e) {
    console.warn('Bind marker click failed:', e)
  }
}

function drawRoute(points: RoutePoint[]): void {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const path = points.map((p: RoutePoint): unknown => new BMap.Point(p.lng, p.lat))
  const polyline = new BMap.Polyline(path, { strokeColor: 'red', strokeWeight: 4, strokeOpacity: 0.9 })
  if (routeOverlay && typeof mapInstance.removeOverlay === 'function') {
    mapInstance.removeOverlay(routeOverlay)
  }
  routeOverlay = polyline
  mapInstance.addOverlay(polyline)
}

// 模拟接口：返回 info（基本信息）、route（轨迹）、alarm（报警）
// 生成围绕当前位置的报警数据（与鱼相关，而不是沿用前一条鱼）
function mockAlarmsFor(center: { lng: number; lat: number }): AlertItem[] {
  const levels: AlertLevel[] = ['高', '中', '低']
  const count = 6 + Math.floor(Math.random() * 5)
  const res: AlertItem[] = []
  for (let i = 0; i < count; i++) {
    const jitterLng = center.lng + (Math.random() - 0.5) * 0.003
    const jitterLat = center.lat + (Math.random() - 0.5) * 0.003
    res.push({
      id: `al-${Date.now()}-${i}`,
      time: new Date(Date.now() - i * 15 * 60 * 1000).toISOString(),
      lng: jitterLng,
      lat: jitterLat,
      level: (levels[Math.floor(Math.random() * levels.length)] as AlertLevel),
    })
  }
  return res
}

async function fetchFishData(
  id: string,
  prevRoute: RoutePoint[]
): Promise<{ info: RobotStatus; route: RoutePoint[]; alarm: AlertItem[] }> {
  const base = robots.find(r => r.id === id) ?? robots[0]
  // 模拟当前位置在基础点附近随机漂移
  const jitter = (): number => (Math.random() - 0.5) * 0.0012
  const nextLng = base.lng + jitter()
  const nextLat = base.lat + jitter()
  const nextDepth = Math.max(0, base.depth + Math.round((Math.random() - 0.5) * 10))
  const nextAltitude = Math.max(0, base.altitude + Math.round((Math.random() - 0.5) * 3))
  const nextYaw = (base.yaw + Math.round((Math.random() - 0.5) * 10) + 360) % 360
  const nextPitch = Math.max(-90, Math.min(90, base.pitch + Math.round((Math.random() - 0.5) * 4)))
  const nextRoll = Math.max(-180, Math.min(180, base.roll + Math.round((Math.random() - 0.5) * 6)))
  const nextBattery = Math.max(0, base.battery - (Math.random() < 0.3 ? 1 : 0))
  const nextAcoustic: SignalLevel = Math.random() < 0.7 ? base.acoustic : (['strong','medium','weak'][Math.floor(Math.random()*3)] as SignalLevel)

  const info: RobotStatus = {
    ...base,
    lng: nextLng,
    lat: nextLat,
    depth: nextDepth,
    altitude: nextAltitude,
    yaw: nextYaw,
    pitch: nextPitch,
    roll: nextRoll,
    battery: nextBattery,
    acoustic: nextAcoustic
  }

  let route: RoutePoint[] = prevRoute.length > 0 ? [...prevRoute] : []
  if (route.length === 0) {
    // 初始化一段规划路线（近似直线+轻微扰动）
    const steps = 12
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const lng = base.lng + t * 0.01 + (Math.random() - 0.5) * 0.0008
      const lat = base.lat + t * 0.01 + (Math.random() - 0.5) * 0.0008
      route.push({ lng, lat, altitude: base.altitude + Math.round((Math.random() - 0.5) * 2), depth: base.depth })
    }
  }
  // 保持原先设置好的轨迹线，不追加最新点

  // 报警：根据该鱼当前位置生成一组新的报警
  const alarm = mockAlarmsFor({ lng: info.lng, lat: info.lat })
  return { info, route, alarm }
}

const routePoints = ref<RoutePoint[]>([])

async function loadSelectedFishData(recenter = false): Promise<void> {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const id = selectedId.value
  const res = await fetchFishData(id, routePoints.value)
  // 将 info 映射回当前选中机器人，驱动右侧基本信息展示
  const target = robots.find(r => r.id === id)
  if (target) {
    target.lng = res.info.lng
    target.lat = res.info.lat
    target.depth = res.info.depth
    target.altitude = res.info.altitude
    target.yaw = res.info.yaw
    target.pitch = res.info.pitch
    target.roll = res.info.roll
    target.battery = res.info.battery
    target.acoustic = res.info.acoustic
  }

  // 更新当前位置标注与轨迹折线
  setCurrentMarker(res.info.lng, res.info.lat, 32)
  routePoints.value = res.route
  drawRoute(routePoints.value)

  // 更新报警列表
  alerts.splice(0, alerts.length, ...res.alarm)

  if (recenter) {
    const point = new BMap.Point(res.info.lng, res.info.lat)
    mapInstance.centerAndZoom(point, 14)
  }
}

async function init(): Promise<void> {
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
      const satType = (window as unknown as { BMAP_SATELLITE_MAP?: unknown }).BMAP_SATELLITE_MAP
      if (satType && typeof map.setMapType === 'function') {
        map.setMapType(satType)
      }

      // 初始化加载选中鱼的数据并绘制
      await loadSelectedFishData(true)

      // 点击地图不产生任何效果（按照需求移除点击处理）

      // 轮询最新数据
      pollTimer = window.setInterval((): void => {
        void loadSelectedFishData(false)
      }, 3000)
    } else {
      console.error('Baidu Map API not available after load')
    }
  } catch (e) {
    console.error('Baidu Map load failed:', e)
  }
}

onMounted((): void => { void init() })

onUnmounted((): void => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  // 清理持续按压的所有定时器
  Object.values(holdTimers).forEach((t): void => { if (t != null) clearInterval(t) })
})

watch(selectedId, (): void => {
  // 切换鱼时清空路径并移除旧折线，随后重新请求新鱼数据
  routePoints.value = []
  if (mapInstance && routeOverlay && typeof mapInstance.removeOverlay === 'function') {
    mapInstance.removeOverlay(routeOverlay)
    routeOverlay = null
  }
  void loadSelectedFishData(true)
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
              <div class="stat-value">{{ currentAltitude }}m</div>
              <div class="stat-label">高度</div>
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
          <div class="console-pad">
            <!-- 左侧：上浮 -->
            <div class="pad-vertical">
              <div
                class="vert-btn ascend"
                @click="ascend"
                @pointerdown="pressStart('ascend')"
                @pointerup="pressStop('ascend')"
                @pointerleave="pressStop('ascend')"
              >
                <span class="icon">⤒</span>
                <span class="text">上浮</span>
              </div>
            </div>
            <div class="dpad">
              <div
                class="pad-btn up"
                @click="moveForward"
                @pointerdown="pressStart('forward')"
                @pointerup="pressStop('forward')"
                @pointerleave="pressStop('forward')"
              ><span class="icon">↑</span></div>
              <div
                class="pad-btn left"
                @click="moveLeft"
                @pointerdown="pressStart('left')"
                @pointerup="pressStop('left')"
                @pointerleave="pressStop('left')"
              ><span class="icon">←</span></div>
              <div
                class="pad-btn right"
                @click="moveRight"
                @pointerdown="pressStart('right')"
                @pointerup="pressStop('right')"
                @pointerleave="pressStop('right')"
              ><span class="icon">→</span></div>
              <div
                class="pad-btn down"
                @click="moveBackward"
                @pointerdown="pressStart('backward')"
                @pointerup="pressStop('backward')"
                @pointerleave="pressStop('backward')"
              ><span class="icon">↓</span></div>
            </div>
            <!-- 右侧：下潜 -->
            <div class="pad-vertical">
              <div
                class="vert-btn descend"
                @click="descend"
                @pointerdown="pressStart('descend')"
                @pointerup="pressStop('descend')"
                @pointerleave="pressStop('descend')"
              >
                <span class="icon">⤓</span>
                <span class="text">下潜</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 视频查看弹窗：单目/双目切换 -->
    <el-dialog v-model="videoDialogVisible" :title="currentVideoTitle" width="60%" class="video-dialog">
      <div class="video-toolbar">
        <el-button-group>
          <el-button type="primary" :plain="videoMode !== 'mono'" @click="videoMode = 'mono'">单目视频</el-button>
          <el-button type="primary" :plain="videoMode !== 'stereo'" @click="videoMode = 'stereo'">双目视频</el-button>
        </el-button-group>
      </div>
      <div class="video-body">
        <template v-if="currentVideoUrl">
          <video :src="currentVideoUrl" controls autoplay style="width: 100%; height: 560px; background: #000"></video>
        </template>
        <template v-else>
          <div class="video-placeholder">
            未配置视频流地址（{{ currentVideoTitle }}）。请接入真实 URL。
          </div>
        </template>
      </div>
    </el-dialog>
  </section>

</template>

<style lang="scss" scoped src="./index.scss"></style>
