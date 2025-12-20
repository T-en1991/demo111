<script setup lang="ts">
/* eslint-disable linebreak-style */
import { onMounted, onUnmounted, reactive, ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { loadBMapGL } from '../../utils/baiduMap'
import { loadOfflineBMap } from '../../utils/offlineBMap'
import VideoPlayerJSMpeg from '../../components/VideoPlayerJSMpeg.vue'
import { useAppStore } from '../../store/app'
import { type RobotStatus, type SignalLevel } from '../../constants/robots'
import { useFishControlStore } from '../../store/fishControl'

// 轨迹点类型（仅前端使用，不持久化）
interface TrackPoint {
  lon: number
  lat: number
  alt: number | null
  depth: number | null
}

const appStore = useAppStore()
const fishControlStore = useFishControlStore()
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

const robots = reactive<RobotStatus[]>([])
const selectedId = computed(() => appStore.selectedRobotId || (robots.length > 0 ? robots[0].id : 0))
const current = computed<RobotStatus | undefined>(() =>
  robots.find((r) => r.id === selectedId.value)
)
// 为模板提供已解包的派生值，优先使用实时状态
const currentLng = computed<number>(() => fishControlStore.currentStatus?.lng ?? current.value?.lng ?? 0)
const currentLat = computed<number>(() => fishControlStore.currentStatus?.lat ?? current.value?.lat ?? 0)
const currentDepth = computed<number>(() => fishControlStore.currentStatus?.depth ?? current.value?.depth ?? 0)
const currentAltitude = computed<number>(() => fishControlStore.currentStatus?.altitude ?? current.value?.altitude ?? 0)
const currentBattery = computed<number>(() => fishControlStore.currentStatus?.battery ?? current.value?.battery ?? 0)
const currentYaw = computed<number>(() => fishControlStore.currentStatus?.yaw ?? current.value?.yaw ?? 0)
const currentPitch = computed<number>(() => fishControlStore.currentStatus?.pitch ?? current.value?.pitch ?? 0)
const currentRoll = computed<number>(() => fishControlStore.currentStatus?.roll ?? current.value?.roll ?? 0)
const currentAcoustic = computed<SignalLevel>(() => (fishControlStore.currentStatus?.acoustic as SignalLevel) ?? current.value?.acoustic ?? 'weak')
let mapInstance: BMapLikeMap | null = null
function getBMap(): BMap2DApi | undefined {
  return (window as { BMap?: unknown }).BMap as BMap2DApi | undefined
}

// 记录每个设备的初始位置与初始深度，供“返航/初始定高”使用
const homes: Record<number, { lng: number; lat: number }> = {}
const initialDepths: Record<number, number> = {}

onMounted(async (): Promise<void> => {
  // 从后端获取机器鱼列表
  try {
    const list = await window.api.fish.findAll()
    if (list && list.length > 0) {
      // 转换为 RobotStatus 格式
      const statusList: RobotStatus[] = list.map(f => ({
        id: f.id,
        name: f.name,
        battery: 100, // 默认电量
        depth: 0,
        altitude: 0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        lng: f.acousticLon || 0, // 使用声通基准或默认0
        lat: f.acousticLat || 0,
        acoustic: 'weak'
      }))
      robots.splice(0, robots.length, ...statusList)

      // 初始化 homes 和 initialDepths
      robots.forEach((r): void => {
        homes[r.id] = { lng: r.lng, lat: r.lat }
        initialDepths[r.id] = r.depth
      })

      // 如果没有选中任何机器鱼，默认选中第一个
      if (!appStore.selectedRobotId) {
        appStore.setSelectedRobotId(robots[0].id)
      }
    }
  } catch (e) {
    console.error('Failed to fetch fish list:', e)
  }

  void init()
})

// 监听串口 SURF 事件并弹框提示
let removeSurfListener: (() => void) | null = null
onMounted(() => {
  // 使用 window.electron.ipcRenderer 并做空值保护
  const ipc = (window as any)?.electron?.ipcRenderer
  if (!ipc || typeof ipc.on !== 'function' || typeof ipc.removeListener !== 'function') return
  const handler = (_evt: unknown, payload: { time?: string; csq?: number; raw?: string; port?: string }) => {
    try {
      const t = payload?.time ?? ''
      const csq = payload?.csq ?? ''
      const dt = t ? t.replace('_', ' ') : ''
      ElMessageBox.alert(`上浮成功\n时间：${dt}\nCSQ：${csq}`, '提示', { type: 'success' })
    } catch { /* ignore */ }
  }
  ipc.on('serial:surf', handler)
  removeSurfListener = () => ipc.removeListener('serial:surf', handler)
})

onBeforeUnmount(() => { removeSurfListener?.() })

// 控制台交互（示例逻辑，可替换为与设备通讯的指令）·
function controlUp(): void {
  console.log('[tap] up')
  void fishControlStore.sendCommand('up')
}
function controlDown(): void {
  console.log('[tap] down')
  void fishControlStore.sendCommand('down')
}
function controlSurf(): void {
  console.log('[tap] surf')
  void fishControlStore.sendCommand('surf')
}
function moveForward(): void {
  console.log('[tap] forward')
  void fishControlStore.sendCommand('forward')
}
function moveLeft(): void {
  console.log('[tap] left')
  void fishControlStore.sendCommand('left')
}
function moveRight(): void {
  console.log('[tap] right')
  void fishControlStore.sendCommand('right')
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

// 为所有控制操作创建防抖包装，避免点击过快
const moveForwardDebounced = debounce(moveForward, 300)
const moveLeftDebounced = debounce(moveLeft, 300)
const moveRightDebounced = debounce(moveRight, 300)
const controlUpDebounced = debounce(controlUp, 300)
const controlDownDebounced = debounce(controlDown, 300)
const controlSurfDebounced = debounce(controlSurf, 300)
const enableManualDebounced = debounce(enableManual, 300)
const enableNavigateDebounced = debounce(enableNavigate, 300)
const setLightOnDebounced = debounce((): void => setLight(true), 300)
const setLightOffDebounced = debounce((): void => setLight(false), 300)
const returnHomeDebounced = debounce(returnHome, 500)
// 已移除“返航/初始定高”按钮与方法（保留示例方向与深度控制）
// 控制台新状态：灯光 (人工/导航模式改为无状态指令)
const lightOn = ref(false)

function enableManual(): void {
  ElMessage.success('人工模式指令已发送')
  void fishControlStore.sendCommand('manual')
}

// 导航弹窗相关状态
const navigateDialogVisible = ref(false)
const navigateTrack = ref<TrackPoint[]>([])
const trackErrors = ref<number[]>([])
const trackErrorDesc = computed(() =>
  trackErrors.value.length ? `问题行：${trackErrors.value.map((i) => i + 1).join(', ')}` : ''
)

function addTrackPoint(): void {
  navigateTrack.value.push({ lon: 0, lat: 0, alt: null, depth: null })
}

function removeTrackPoint(index: number): void {
  if (index >= 0 && index < navigateTrack.value.length) {
    navigateTrack.value.splice(index, 1)
  }
}

function recomputeTrackErrors(): void {
  const errs: number[] = []
  navigateTrack.value.forEach((p, idx) => {
    const hasLon = p.lon !== null && p.lon !== undefined
    const hasLat = p.lat !== null && p.lat !== undefined
    const hasAlt = p.alt !== null && p.alt !== undefined
    const hasDepth = p.depth !== null && p.depth !== undefined

    // 经纬度必填
    if (!hasLon || !hasLat) {
      errs.push(idx)
      return
    }

    // 高度和深度二选一
    if (!((hasAlt && !hasDepth) || (!hasAlt && hasDepth))) {
      errs.push(idx)
    }
  })
  trackErrors.value = errs
}

watch(
  navigateTrack,
  () => recomputeTrackErrors(),
  { deep: true }
)

async function enableNavigate(): Promise<void> {
  const currentFish = fishControlStore.currentFish
  console.log('enableNavigate', currentFish)
  if (!currentFish) {
    ElMessage.warning('请先选择机器鱼')
    return
  }

  // 先发送导航指令，确认成功后再打开弹窗
  const success = await fishControlStore.enterNavigationMode()
  if (!success) return

  try {
    const fish = await window.api.fish.findById(currentFish.id)
    console.log(fish)
    if (fish) {
      // 解析后端返回的 track 数据
      let tracks: TrackPoint[] = []
      if (Array.isArray(fish.track)) {
        tracks = (fish.track as unknown[]).map((tp) => {
          const o = tp as Record<string, unknown>
          const lon = typeof o.lon === 'number' ? o.lon : Number(o.lon)
          const lat = typeof o.lat === 'number' ? o.lat : Number(o.lat)
          const altRaw = o.alt
          const depthRaw = o.depth
          const altNum = altRaw === null || altRaw === undefined ? null : Number(altRaw)
          const depthNum = depthRaw === null || depthRaw === undefined ? null : Number(depthRaw)
          return {
            lon: Number.isFinite(lon) ? lon : 0,
            lat: Number.isFinite(lat) ? lat : 0,
            alt: altNum !== null && !Number.isFinite(altNum as number) ? null : altNum,
            depth: depthNum !== null && !Number.isFinite(depthNum as number) ? null : depthNum
          }
        })
      }
      navigateTrack.value = tracks
      navigateDialogVisible.value = true
    } else {
      ElMessage.error('获取机器鱼数据失败')
    }
  } catch (error) {
    console.error('获取机器鱼数据出错:', error)
    ElMessage.error('获取机器鱼数据出错')
  }
}

async function confirmNavigate(): Promise<void> {
  const currentFish = fishControlStore.currentFish
  if (!currentFish) return

  // 校验
  recomputeTrackErrors()
  if (trackErrors.value.length) {
    ElMessage.error('轨迹校验失败：经度、纬度必填，且高度与深度必须二选一')
    return
  }

  try {
    // 1. 更新鱼的轨迹信息
    // 注意：这里我们只更新 track 字段，但 update 接口可能需要其他字段保持不变或者允许部分更新
    // 假设 update 接口支持部分更新（Prisma 通常支持）
    // 但我们的 preload/ipc 封装可能需要传递完整对象或者特定的结构
    // 查看 preload 定义，update 接收的是可选字段，所以只传 track 是可以的

    // 保留 6 位小数
    const cleanTrack = navigateTrack.value.map((p) => ({
      lon: Math.round(p.lon * 1e6) / 1e6,
      lat: Math.round(p.lat * 1e6) / 1e6,
      alt: p.alt,
      depth: p.depth
    }))

    await window.api.fish.update(currentFish.id, {
      track: cleanTrack
    })

    ElMessage.success('轨迹已保存，开始执行导航流程')
    // Start complex navigation flow (Navigate -> Wait -> Upload Trajectory)
    // Map UI TrackPoint to Store TrackPoint
    const storeTrack = cleanTrack.map(p => ({
      lon: p.lon,
      lat: p.lat,
      alt: p.alt,
      depth: p.depth
    }))

    // We don't await this because it's a long running process with its own UI feedback
    // and we want to close the dialog immediately.
    void fishControlStore.sendTrajectory(storeTrack)

    navigateDialogVisible.value = false
  } catch (error) {
    console.error('保存轨迹失败:', error)
    ElMessage.error('保存轨迹失败')
  }
}

function setLight(on: boolean): void {
  lightOn.value = on
  ElMessage.success(`灯光：${on ? '开启' : '关闭'}`)
  void fishControlStore.sendCommand(on ? 'lightOn' : 'lightOff')
}
function returnHome(): void {
  // const BMap = getBMap()
  // if (!BMap || !mapInstance) return
  // const id = selectedId.value
  // const home = homes[id]
  // if (!home) return
  // const point = new BMap.Point(home.lng, home.lat)
  // mapInstance.centerAndZoom(point, 14)
  // const target = robots.find((r) => r.id === id)
  // if (target) {
  //   target.lng = home.lng
  //   target.lat = home.lat
  //   ElMessage.success('已返航至初始位置')
  // }
  ElMessage.success('返航指令已发送')

  void fishControlStore.sendCommand('return')
}


import type { Alert, AlertLevel } from '@prisma/client'

// 报警信息数据结构使用 Prisma 生成的类型
type AlertItem = Alert

// 图片接收进度状态 Key: filename, Value: { current, total }
const imageProgress = reactive<Record<string, { current: number; total: number }>>({})

// 监听图片传输进度
let removeImageProgressListener: (() => void) | null = null
let removeImageCompleteListener: (() => void) | null = null

onMounted(() => {
  const ipc = (window as any)?.electron?.ipcRenderer
  if (!ipc || typeof ipc.on !== 'function') return

  const progressHandler = (_evt: unknown, payload: { imageId: string; current: number; total: number; filename: string }) => {
    if (payload.filename) {
      imageProgress[payload.filename] = { current: payload.current, total: payload.total }
    }
  }

  const completeHandler = (_evt: unknown, payload: { imageId: string; filename: string }) => {
    if (payload.filename) {
      delete imageProgress[payload.filename]
      // 图片接收完成，刷新列表显示图片
      void fetchAlertsAndUpdate()
      ElMessage.success(`图片 ${payload.filename} 接收完成`)
    }
  }

  ipc.on('serial:image-progress', progressHandler)
  ipc.on('serial:image-complete', completeHandler)

  removeImageProgressListener = () => ipc.removeListener('serial:image-progress', progressHandler)
  removeImageCompleteListener = () => ipc.removeListener('serial:image-complete', completeHandler)
})

onBeforeUnmount(() => {
  removeImageProgressListener?.()
  removeImageCompleteListener?.()
})

const alerts = reactive<AlertItem[]>([])

function levelClass(level: AlertLevel): string {
  return level === 'critical' ? 'lv-high' : level === 'error' ? 'lv-high' : level === 'warning' ? 'lv-mid' : 'lv-low'
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

async function fetchAlertsAndUpdate(): Promise<void> {
  try {
    const res = await (window as any).api?.alert?.list?.({
      page: 1,
      pageSize: 10,
      fromSocket: true
    })
    const items = Array.isArray(res?.items) ? res.items : []
    // 按照 createdAt 倒序排序
    items.sort(
      (a: AlertItem, b: AlertItem) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    const top10 = items.slice(0, 10)
    alerts.splice(0, alerts.length, ...top10)
  } catch (e) {
    console.error('fetchAlertsAndUpdate failed:', e)
  }
}

const router = useRouter()
const alertImageDialogVisible = ref(false)
const currentAlertImageUrl = ref<string>('')

async function focusAlert(a: AlertItem): Promise<void> {
  // 如果图片正在接收中，提示进度
  if (a.imgFile && imageProgress[a.imgFile]) {
    const p = imageProgress[a.imgFile]
    ElMessage.warning(`图片接收中... ${p.current}/${p.total}`)
    return
  }

  // 有base64数据则直接弹窗展示
  if (a.imageBase64) {
    currentAlertImageUrl.value = a.imageBase64
    alertImageDialogVisible.value = true
  }
  // 如果没有base64但有imageUrl，也尝试显示
  // else if (a.imgFile) {
  //   currentAlertImageUrl.value = a.imgFile
  //   alertImageDialogVisible.value = true
  // }
  // 无图片数据时发送PICSTART命令
  else {
    // 提取图片文件名，从imageUrl或生成默认文件名
    ElMessage.warning('请上浮')
    const imageName = a.imgFile ? a.imgFile.split('/').pop() || `fm_${new Date().toISOString().replace(/[-:.TZ]/g, '')}.jpg` : `fm_${new Date().toISOString().replace(/[-:.TZ]/g, '')}.jpg`
    try {
      // 从COM口发送PICSTART命令
      const command = `PICSTART ${imageName}`
      const ok = await (window as any).api?.serial?.write?.(command)
      if (ok) {
        ElMessage.success(`已发送PICSTART命令: ${command}`)
      } else {
        ElMessage.error('发送PICSTART命令失败')
      }
    } catch (e) {
      console.error('发送PICSTART命令出错:', e)
      ElMessage.error('发送PICSTART命令出错')
    }
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
let alertPollTimer: number | null = null
// 持续按压动作的定时器集合（键：动作名；值：setInterval 返回的标识）
const holdTimers: Record<string, number> = {}

// 视频弹窗状态
type VideoMode = 'mono' | 'stereo'
const videoDialogVisible = ref(false)
const videoMode = ref<VideoMode>('mono')
const videoLoading = ref(false)

// 监听videoMode变化，切换RTSP流类型
watch(videoMode, async (newMode) => {
  if (current.value && videoDialogVisible.value) {
    try {
      // 显示加载框
      videoLoading.value = true

      // 调用RTSP API切换流类型，传递fishId和正确的流类型
      const result = await window.electron.ipcRenderer.invoke(
        'rtsp:start',
        current.value.id,
        newMode
      )
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
const currentVideoTitle = computed((): string => '实时视频')
const showVideoPlayer = ref(true)
function openVideo(mode: VideoMode): void {
  videoMode.value = mode
  showVideoPlayer.value = true
  videoDialogVisible.value = true
}
function onVideoDialogClose(): void {
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
    ; (
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
  const levels: AlertLevel[] = ['critical', 'error', 'warning']
  const count = 6 + Math.floor(Math.random() * 5)
  const res: AlertItem[] = []
  for (let i = 0; i < count; i++) {
    const jitterLng = center.lng + (Math.random() - 0.5) * 0.003
    const jitterLat = center.lat + (Math.random() - 0.5) * 0.003
    const hasImage = Math.random() < 0.5
    res.push({
      id: Number(Date.now() + i),
      title: `报警 ${i}`,
      message: `模拟报警信息 ${i}`,
      level: levels[Math.floor(Math.random() * levels.length)] as AlertLevel,
      type: 'alarm',
      source: 'mock',
      status: 'active',
      fishId: null,
      imgFile: hasImage ? fishIconUrl : null,
      lat: jitterLat,
      lon: jitterLng,
      fromSocket: false,
      imageBase64: null,
      createdAt: new Date(Date.now() - i * 15 * 60 * 1000)
    })
  }
  return res
}

async function fetchFishData(
  id: number,
  prevRoute: RoutePoint[]
): Promise<{ info: RobotStatus; route: RoutePoint[]; alarm: AlertItem[] }> {
  const base = robots.find((r) => r.id === id) ?? robots[0]
  if (!base) {
    // Should not happen if robots is populated
    throw new Error('No fish found')
  }
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
  if (robots.length === 0) return
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
      if (start) {
        const center = new BMap.Point(start.lng, start.lat)
        map.centerAndZoom(center, 12)
      } else {
        const center = new BMap.Point(121.4737, 31.2304)
        map.centerAndZoom(center, 12)
      }
      map.enableScrollWheelZoom(true)
      map.addControl(new BMap.NavigationControl())
      map.addControl(new BMap.ScaleControl())
      // 默认使用普通地图，不再强制切换为卫星地图
      /*
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
      */

      // 初始化加载选中鱼的数据并绘制
      await loadSelectedFishData(true)

      // 点击地图不产生任何效果（按照需求移除点击处理）

      // 轮询最新数据
      pollTimer = window.setInterval((): void => {
        void loadSelectedFishData(false)
      }, 3000)

      // 拉取报警并启动轮询（每分钟）
      await fetchAlertsAndUpdate()
      alertPollTimer = window.setInterval(() => {
        void fetchAlertsAndUpdate()
      }, 60000)
    } else {
      console.error('Baidu Map API not available after load')
    }
  } catch (e) {
    console.error('Baidu Map load failed:', e)
  }
}


onUnmounted((): void => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (alertPollTimer) {
    clearInterval(alertPollTimer)
    alertPollTimer = null
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
              <div class="stat-label">航向角</div>
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
                <span :class="[
                  'sig',
                  currentAcoustic === 'strong'
                    ? 's-strong'
                    : currentAcoustic === 'medium'
                      ? 's-medium'
                      : 's-weak'
                ]">
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
            <div v-for="(a, i) in alerts" :key="a.id" class="alert-card" @dblclick="focusAlert(a)">
              <div class="alert-index">
                <span>{{ i + 1 }}</span>
              </div>
              <div class="alert-main">
                <div class="alert-title">
                  <span v-if="a.imgFile" >
                     {{ a.imgFile.split(/[/\\]/).pop() }}
                  </span>
                  &nbsp;  &nbsp;
                  <span v-if="a.imageBase64" class="alert-image-icon">📷</span>
                  <span v-else-if="a.imgFile && imageProgress[a.imgFile]" class="alert-image-icon" style="font-size: 0.8em; color: #e6a23c;">
                    ⏳ {{ imageProgress[a.imgFile].current }}/{{ imageProgress[a.imgFile].total }}
                  </span>
                  <span v-else-if="a.imgFile" class="alert-image-icon">📷</span>
                </div>
                <div class="alert-sub">
                  <span> {{ formatTime(a.createdAt.toString()) }}  &nbsp;  &nbsp;</span>
                  经度 {{ Number(a.lon ?? 0).toFixed(6) }} · 纬度 {{ Number(a.lat ?? 0).toFixed(6) }}

                </div>
              </div>
              <div class="alert-level" :class="levelClass(a.level)">{{ a.level }}</div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="section-title">控制台</div>
          <div class="actions-grid">
            <!-- 方向控制 -->
            <button class="action-btn primary" @click="moveForwardDebounced">
              <span class="icon">↑</span><span class="text">向前</span>
            </button>
            <button class="action-btn primary" @click="moveLeftDebounced">
              <span class="icon">←</span><span class="text">向左</span>
            </button>
            <button class="action-btn primary" @click="moveRightDebounced">
              <span class="icon">→</span><span class="text">向右</span>
            </button>
            <!-- 垂直运动 -->
            <button class="action-btn accent" @click="controlUpDebounced">
              <span class="icon">⤒</span><span class="text">向上</span>
            </button>
            <button class="action-btn accent" @click="controlDownDebounced">
              <span class="icon">⤓</span><span class="text">向下</span>
            </button>
            <button class="action-btn accent" @click="controlDownDebounced">
              <span class="icon">⤓</span><span class="text">下潜</span>
            </button>
            <!-- 模式/返航/上浮 -->
            <button class="action-btn warn" @click="enableManualDebounced">
              <span class="icon">⚙️</span><span class="text">人工</span>
            </button>
            <button class="action-btn info" @click="returnHomeDebounced">
              <span class="icon">🏠</span><span class="text">返航</span>
            </button>
            <button class="action-btn accent" @click="controlSurfDebounced">
              <span class="icon">⤒</span><span class="text">上浮</span>
            </button>
            <!-- 功耗与灯光 -->
            <button class="action-btn warn" @click="enableNavigateDebounced">
              <span class="icon">🌙</span><span class="text">导航</span>
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
    <el-dialog v-model="videoDialogVisible" :title="currentVideoTitle" width="60%" class="video-dialog"
      @close="onVideoDialogClose">
      <div class="video-toolbar">
        <el-button-group>
          <el-button type="primary" :plain="videoMode !== 'mono'" :loading="videoLoading"
            @click="videoMode = 'mono'">单目视频</el-button>
          <el-button type="primary" :plain="videoMode !== 'stereo'" :loading="videoLoading"
            @click="videoMode = 'stereo'">双目视频</el-button>
        </el-button-group>
      </div>
      <div class="video-body">
        <div :class="['video-container', { 'video-loading': videoLoading }]">
          <el-loading v-loading="videoLoading" text="正在切换视频流..." background="rgba(0, 0, 0, 0.8)">
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
      <div style="
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 10px;
          background: linear-gradient(135deg, #1f2230, #25293a);
        ">
        <template v-if="currentAlertImageUrl">
          <img :src="currentAlertImageUrl" alt="报警图片" style="width: 100%; border-radius: 8px" />
        </template>
        <template v-else>
          <div style="
              height: 320px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #9fb2ff;
            ">
            暂无图片信息
          </div>
        </template>
      </div>
    </el-dialog>
    <!-- 导航弹窗 -->
    <el-dialog v-model="navigateDialogVisible" title="导航设置" width="800px" class="navigate-dialog">
      <div class="dialog-content">
        <div style="margin-bottom: 8px">
          <el-button type="primary" plain @click="addTrackPoint">添加轨迹点</el-button>
        </div>
        <el-table :data="navigateTrack" border stripe style="width: 100%" size="small" max-height="400">
          <el-table-column label="经度">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].lon" :min="-180" :max="180" :step="0.0001" :precision="4"
                controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="纬度">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].lat" :min="-90" :max="90" :step="0.0001" :precision="4"
                controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="高度">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].alt" :min="0" :step="0.01" :precision="2" controls-position="right"
                style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="深度">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].depth" :min="0" :step="0.01" :precision="2" controls-position="right"
                style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ $index }">
              <el-button size="small" type="danger" plain @click="removeTrackPoint($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="trackErrors.length" style="margin-top: 8px">
          <el-alert type="error" show-icon :closable="false" :title="'轨迹校验失败：经度、纬度必填，且高度与深度必须二选一'"
            :description="trackErrorDesc" />
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="navigateDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmNavigate">保存并开始导航</el-button>
        </span>
      </template>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
