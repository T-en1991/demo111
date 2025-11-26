<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { loadBMapGL } from '../../utils/baiduMap'
import { loadOfflineBMap } from '../../utils/offlineBMap'
import VideoPlayerJSMpeg from '../../components/VideoPlayerJSMpeg.vue'

const AK = 'iWyOxtxr32YCdQBu9yYeICmRKBb6Jm1h'
// 使用项目静态资源作为标注图标
const fishIconUrl = new URL('../../assets/images/fish.svg', import.meta.url).href

// 最小类型定义，覆盖当前使用到的构造与方法，避免使用 any
type BMapLikeMap = {
  centerAndZoom: (point: unknown, zoom: number) => void
  enableScrollWheelZoom: (enable: boolean) => void
  addControl: (control: unknown) => void
  addEventListener: (
    name: string,
    handler: (e: { point: { lng: number; lat: number } }) => void
  ) => void
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
  // 将默认选中的 A1 初始位置设置为经度 53.573275、纬度 24.281445
  {
    id: 'A1',
    name: '鲸鲨01号',
    battery: 98,
    depth: 100,
    altitude: 5,
    yaw: 260,
    pitch: 15,
    roll: 2,
    lng: 53.573275,
    lat: 24.281445,
    acoustic: 'strong'
  },
  {
    id: 'B2',
    name: '鲸鲨02号',
    battery: 86,
    depth: 80,
    altitude: 8,
    yaw: 120,
    pitch: 8,
    roll: 5,
    lng: 121.4737,
    lat: 31.2304,
    acoustic: 'medium'
  },
  {
    id: 'C3',
    name: '鲸鲨03号',
    battery: 72,
    depth: 60,
    altitude: 3,
    yaw: 45,
    pitch: 12,
    roll: 3,
    lng: 113.2644,
    lat: 23.1291,
    acoustic: 'weak'
  }
])
const selectedId = ref<string>(robots[0].id)
const current = computed<RobotStatus | undefined>(() =>
  robots.find((r) => r.id === selectedId.value)
)
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
function moveForward(): void {
  console.log('[tap] forward')
}
function moveLeft(): void {
  console.log('[tap] left')
}
function moveRight(): void {
  console.log('[tap] right')
}

// 按住持续触发：开始/停止
function startHold(key: string, handler: () => void, interval = 200, immediate = true): void {
  if (holdTimers[key] != null) return
  if (immediate) handler()
  holdTimers[key] = window.setInterval(handler, interval)
}
function stopHold(key: string): void {
  const t = holdTimers[key]
  if (t != null) {
    clearInterval(t)
    delete holdTimers[key]
  }
}

// 防抖：用于非连续性操作避免短时间内重复触发
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  wait = 300
): (...args: Parameters<T>) => void {
  let timer: number | null = null
  return (...args: Parameters<T>): void => {
    if (timer != null) {
      clearTimeout(timer)
    }
    timer = window.setTimeout((): void => {
      timer = null
      fn(...args)
    }, wait)
  }
}

// 为非连续性操作创建防抖包装
const toggleManualDebounced = debounce(toggleManual, 300)
const toggleLowPowerDebounced = debounce(toggleLowPower, 300)
const setLightOnDebounced = debounce((): void => setLight(true), 300)
const setLightOffDebounced = debounce((): void => setLight(false), 300)
const returnHomeDebounced = debounce(returnHome, 500)
// 已移除“返航/初始定高”按钮与方法（保留示例方向与深度控制）
// 控制台新状态：人工模式、低功耗、灯光
const manualMode = ref(false)
const lowPowerMode = ref(false)
const lightOn = ref(false)

function toggleManual(): void {
  manualMode.value = !manualMode.value
  ElMessage.success(`人工模式：${manualMode.value ? '开启' : '关闭'}`)
}
function toggleLowPower(): void {
  lowPowerMode.value = !lowPowerMode.value
  ElMessage.success(`低功耗模式：${lowPowerMode.value ? '开启' : '关闭'}`)
}
function setLight(on: boolean): void {
  lightOn.value = on
  ElMessage.success(`灯光：${on ? '开启' : '关闭'}`)
}
function returnHome(): void {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const id = selectedId.value
  const home = homes[id]
  if (!home) return
  const point = new BMap.Point(home.lng, home.lat)
  mapInstance.centerAndZoom(point, 14)
  const target = robots.find((r) => r.id === id)
  if (target) {
    target.lng = home.lng
    target.lat = home.lat
    ElMessage.success('已返航至初始位置')
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
  imageUrl?: string
}

const alerts = reactive<AlertItem[]>([
  {
    id: 'al-1',
    time: new Date().toISOString(),
    lng: robots[0].lng + 0.0012,
    lat: robots[0].lat + 0.0012,
    level: '高',
    imageUrl: fishIconUrl
  },
  {
    id: 'al-2',
    time: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0008,
    lat: robots[0].lat - 0.0006,
    level: '中'
  },
  {
    id: 'al-3',
    time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng + 0.0024,
    lat: robots[0].lat - 0.0014,
    level: '低',
    imageUrl: fishIconUrl
  },
  {
    id: 'al-4',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  },
  {
    id: 'al-5',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  },
  {
    id: 'al-6',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  },
  {
    id: 'al-7',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  },
  {
    id: 'al-8',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  },
  {
    id: 'al-9',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  },
  {
    id: 'al-10',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  },
  {
    id: 'al-11',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  },
  {
    id: 'al-12',
    time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lng: robots[0].lng - 0.0032,
    lat: robots[0].lat + 0.0022,
    level: '中'
  }
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

const router = useRouter()
const alertImageDialogVisible = ref(false)
const currentAlertImageUrl = ref<string>('')

function focusAlert(a: AlertItem): void {
  // 有图片则直接弹窗展示；无图片则弹出提示
  if (a.imageUrl) {
    currentAlertImageUrl.value = a.imageUrl
    alertImageDialogVisible.value = true
  } else {
    void ElMessageBox.alert('如需查看详细信息，请先让设备浮出水面后再操作', '提示', {
      type: 'warning'
    })
  }
}

function goHistory(): void {
  // 跳转到历史页面（按路由名称）
  router.push({ name: 'history' })
}

// 路径折线与当前位置标注引用，便于更新与移除
let routeOverlay: unknown | null = null
let currentMarker: unknown | null = null
let pollTimer: number | null = null
// 持续按压动作的定时器集合（键：动作名；值：setInterval 返回的标识）
const holdTimers: Record<string, number> = {}

// 视频弹窗状态
type VideoMode = 'mono' | 'stereo'
const videoDialogVisible = ref(false)
const videoMode = ref<VideoMode>('mono')
const videoUrls = reactive<Record<string, { mono?: string; stereo?: string }>>({})
const videoLoading = ref(false)

// 监听videoMode变化，切换RTSP流类型
watch(videoMode, async (newMode) => {
  if (current.value && videoDialogVisible.value) {
    try {
      // 显示加载框
      videoLoading.value = true
      
      // 调用RTSP API切换流类型，传递fishId和正确的流类型
      const result = await window.electron.ipcRenderer.invoke('rtsp:start', current.value.id, newMode)
      if (result.success) {
        console.log(`已切换到${newMode === 'mono' ? '单目' : '双目'}视频流`)
      } else {
        console.error('切换RTSP流类型失败:', result.message)
        ElMessage.error('切换视频流失败: ' + result.message)
      }
    } catch (error) {
      console.error('切换RTSP流类型失败:', error)
      ElMessage.error('切换视频流失败，请检查连接')
    } finally {
      // 无论成功失败，都关闭加载框
      setTimeout(() => {
        videoLoading.value = false
      }, 300) // 添加短暂延迟让用户能看到加载状态
    }
  }
})
// 使用本地示例视频，同时作为单目与双目演示源
const mockVideoUrl = new URL('../../assets/mock.mp4', import.meta.url).href
videoUrls['A1'] = { mono: mockVideoUrl, stereo: mockVideoUrl }
videoUrls['B2'] = { mono: mockVideoUrl, stereo: mockVideoUrl }
videoUrls['C3'] = { mono: mockVideoUrl, stereo: mockVideoUrl }
const currentVideoTitle = computed((): string => '实时视频')
const showVideoPlayer = ref(true)
function openVideo(mode: VideoMode): void {
  videoMode.value = mode
  showVideoPlayer.value = true
  videoDialogVisible.value = true
}
function onVideoDialogClose() {
  showVideoPlayer.value = false
  setTimeout(() => {
    showVideoPlayer.value = true
  }, 100)
  videoDialogVisible.value = false
}

type RoutePoint = { lng: number; lat: number; altitude: number; depth: number }

function setCurrentMarker(lng: number, lat: number, size = 56): void {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const point = new BMap.Point(lng, lat)
  if (currentMarker && typeof mapInstance.removeOverlay === 'function') {
    mapInstance.removeOverlay(currentMarker)
  }
  const icon = new BMap.Icon(fishIconUrl, new BMap.Size(size, size), {
    imageSize: new BMap.Size(size, size),
    anchor: new BMap.Size(Math.round(size / 2), Math.round(size / 2))
  })
  currentMarker = new BMap.Marker(point, { icon })
  mapInstance.addOverlay(currentMarker)
  // 点击鱼标注，打开视频弹窗（默认单目）
  try {
    ;(
      currentMarker as { addEventListener?: (type: string, handler: () => void) => void }
    ).addEventListener?.('click', (): void => {
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
  const polyline = new BMap.Polyline(path, {
    strokeColor: 'red',
    strokeWeight: 4,
    strokeOpacity: 0.9
  })
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
    const hasImage = Math.random() < 0.5
    res.push({
      id: `al-${Date.now()}-${i}`,
      time: new Date(Date.now() - i * 15 * 60 * 1000).toISOString(),
      lng: jitterLng,
      lat: jitterLat,
      level: levels[Math.floor(Math.random() * levels.length)] as AlertLevel,
      imageUrl: hasImage ? fishIconUrl : undefined
    })
  }
  return res
}

async function fetchFishData(
  id: string,
  prevRoute: RoutePoint[]
): Promise<{ info: RobotStatus; route: RoutePoint[]; alarm: AlertItem[] }> {
  const base = robots.find((r) => r.id === id) ?? robots[0]
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
  const nextAcoustic: SignalLevel =
    Math.random() < 0.7
      ? base.acoustic
      : (['strong', 'medium', 'weak'][Math.floor(Math.random() * 3)] as SignalLevel)

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
    const steps = 24
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const lng = base.lng + t * 0.05 + (Math.random() - 0.5) * 0.001
      const lat = base.lat + t * 0.05 + (Math.random() - 0.5) * 0.001
      route.push({
        lng,
        lat,
        altitude: base.altitude + Math.round((Math.random() - 0.5) * 2),
        depth: base.depth
      })
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
  const target = robots.find((r) => r.id === id)
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
  setCurrentMarker(res.info.lng, res.info.lat, 56)
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
      !navigator.onLine ||
      globalCfg.__MAP_MODE === 'offline' ||
      localStorage.getItem('MAP_MODE') === 'offline'
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
      // 切换为卫星地图（若常量可用）
      try {
        const sat =
          (window as { BMAP_SATELLITE_MAP?: unknown }).BMAP_SATELLITE_MAP ??
          (BMap as unknown as { SATELLITE_MAP?: unknown }).SATELLITE_MAP
        if (map.setMapType && sat) {
          map.setMapType(sat as unknown)
        }
      } catch (e) {
        console.warn('Switch to satellite map failed:', e)
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

onMounted((): void => {
  void init()
})

onUnmounted((): void => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  // 清理持续按压的所有定时器
  Object.values(holdTimers).forEach((t): void => {
    clearInterval(t)
  })
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
            <el-select
              v-model="selectedId"
              size="large"
              class="robot-select"
              placeholder="选择机器人"
            >
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
                <span
                  :class="[
                    'sig',
                    currentAcoustic === 'strong'
                      ? 's-strong'
                      : currentAcoustic === 'medium'
                        ? 's-medium'
                        : 's-weak'
                  ]"
                >
                  {{
                    currentAcoustic === 'strong' ? '强' : currentAcoustic === 'medium' ? '中' : '弱'
                  }}
                </span>
              </div>
              <div class="stat-label">声通信号强度</div>
            </div>
          </div>
        </div>

        <div class="panel-card alerts-card">
          <div class="section-header">
            <div class="section-title">报警信息</div>
            <button class="section-more" type="button" title="查看历史" @click="goHistory()">
              ...
            </button>
          </div>
          <div class="alerts-list">
            <div v-for="(a, i) in alerts" :key="a.id" class="alert-card" @click="focusAlert(a)">
              <div class="alert-index">
                <span>{{ i + 1 }}</span>
              </div>
              <div class="alert-main">
                <div class="alert-title">{{ formatTime(a.time) }}</div>
                <div class="alert-sub">
                  经度 {{ Number(a.lng).toFixed(6) }} · 纬度 {{ Number(a.lat).toFixed(6) }}
                </div>
              </div>
              <div class="alert-level" :class="levelClass(a.level)">{{ a.level }}</div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="section-title">控制台</div>
          <div class="actions-grid">
            <!-- 第一行：方向 -->
            <button
              class="action-btn primary"
              @mousedown="startHold('forward', moveForward, 100)"
              @mouseup="stopHold('forward')"
              @mouseleave="stopHold('forward')"
              @touchstart.passive="startHold('forward', moveForward, 100)"
              @touchend="stopHold('forward')"
              @touchcancel="stopHold('forward')"
            >
              <span class="icon">↑</span><span class="text">向前</span>
            </button>
            <button
              class="action-btn primary"
              @mousedown="startHold('left', moveLeft, 100)"
              @mouseup="stopHold('left')"
              @mouseleave="stopHold('left')"
              @touchstart.passive="startHold('left', moveLeft, 100)"
              @touchend="stopHold('left')"
              @touchcancel="stopHold('left')"
            >
              <span class="icon">←</span><span class="text">向左</span>
            </button>
            <button
              class="action-btn primary"
              @mousedown="startHold('right', moveRight, 100)"
              @mouseup="stopHold('right')"
              @mouseleave="stopHold('right')"
              @touchstart.passive="startHold('right', moveRight, 100)"
              @touchend="stopHold('right')"
              @touchcancel="stopHold('right')"
            >
              <span class="icon">→</span><span class="text">向右</span>
            </button>
            <!-- 第二行：垂直运动 -->
            <button
              class="action-btn accent"
              @mousedown="startHold('ascend1', ascend, 100)"
              @mouseup="stopHold('ascend1')"
              @mouseleave="stopHold('ascend1')"
              @touchstart.passive="startHold('ascend1', ascend, 100)"
              @touchend="stopHold('ascend1')"
              @touchcancel="stopHold('ascend1')"
            >
              <span class="icon">⤒</span><span class="text">向上</span>
            </button>
            <button
              class="action-btn accent"
              @mousedown="startHold('descend1', descend, 100)"
              @mouseup="stopHold('descend1')"
              @mouseleave="stopHold('descend1')"
              @touchstart.passive="startHold('descend1', descend, 100)"
              @touchend="stopHold('descend1')"
              @touchcancel="stopHold('descend1')"
            >
              <span class="icon">⤓</span><span class="text">向下</span>
            </button>
            <button
              class="action-btn accent"
              @mousedown="startHold('descend2', descend, 100)"
              @mouseup="stopHold('descend2')"
              @mouseleave="stopHold('descend2')"
              @touchstart.passive="startHold('descend2', descend, 100)"
              @touchend="stopHold('descend2')"
              @touchcancel="stopHold('descend2')"
            >
              <span class="icon">⤓</span><span class="text">下潜</span>
            </button>
            <!-- 第三行：模式/返航/上浮 -->
            <button class="action-btn warn" @click="toggleManualDebounced">
              <span class="icon">⚙️</span><span class="text">人工模式</span
              ><span class="state" :class="manualMode ? 'on' : 'off'">{{
                manualMode ? '开' : '关'
              }}</span>
            </button>
            <button class="action-btn info" @click="returnHomeDebounced">
              <span class="icon">🏠</span><span class="text">返航</span>
            </button>
            <button
              class="action-btn accent"
              @mousedown="startHold('ascend2', ascend, 100)"
              @mouseup="stopHold('ascend2')"
              @mouseleave="stopHold('ascend2')"
              @touchstart.passive="startHold('ascend2', ascend, 100)"
              @touchend="stopHold('ascend2')"
              @touchcancel="stopHold('ascend2')"
            >
              <span class="icon">⤒</span><span class="text">上浮</span>
            </button>
            <!-- 第四行：功耗与灯光 -->
            <button class="action-btn warn" @click="toggleLowPowerDebounced">
              <span class="icon">🌙</span><span class="text">低功耗模式</span
              ><span class="state" :class="lowPowerMode ? 'on' : 'off'">{{
                lowPowerMode ? '开' : '关'
              }}</span>
            </button>
            <button class="action-btn info" @click="setLightOnDebounced">
              <span class="icon">💡</span><span class="text">灯开</span>
            </button>
            <button class="action-btn info" @click="setLightOffDebounced">
              <span class="icon">💡</span><span class="text">灯关</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- 视频查看弹窗：单目/双目切换 -->
    <el-dialog
      v-model="videoDialogVisible"
      :title="currentVideoTitle"
      width="60%"
      class="video-dialog"
      @close="onVideoDialogClose"
    >
      <div class="video-toolbar">
        <el-button-group>
          <el-button type="primary" :plain="videoMode !== 'mono'" @click="videoMode = 'mono'"
            :loading="videoLoading">单目视频</el-button
          >
          <el-button type="primary" :plain="videoMode !== 'stereo'" @click="videoMode = 'stereo'"
            :loading="videoLoading">双目视频</el-button
          >
        </el-button-group>
      </div>
      <div class="video-body">
        <div :class="['video-container', { 'video-loading': videoLoading }]">
          <el-loading
            v-loading="videoLoading"
            text="正在切换视频流..."
            background="rgba(0, 0, 0, 0.8)"
          >
            <template v-if="showVideoPlayer && videoMode === 'mono'">
              <VideoPlayerJSMpeg url="ws://localhost:8085/" />
            </template>
            <template v-else-if="showVideoPlayer && videoMode === 'stereo'">
              <VideoPlayerJSMpeg url="ws://localhost:8085/" />
            </template>
            <template v-else>
              <div class="video-placeholder">
                未配置视频流地址（{{ currentVideoTitle }}）。请接入真实 URL。
              </div>
            </template>
          </el-loading>
        </div>
      </div>
    </el-dialog>
    <!-- 报警图片弹窗：有图则直接展示 -->
    <el-dialog v-model="alertImageDialogVisible" title="报警图片" width="50%" class="image-dialog">
      <div
        style="
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 10px;
          background: linear-gradient(135deg, #1f2230, #25293a);
        "
      >
        <template v-if="currentAlertImageUrl">
          <img :src="currentAlertImageUrl" alt="报警图片" style="width: 100%; border-radius: 8px" />
        </template>
        <template v-else>
          <div
            style="
              height: 320px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #9fb2ff;
            "
          >
            暂无图片信息
          </div>
        </template>
      </div>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
