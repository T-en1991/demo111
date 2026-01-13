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
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
const selectedId = computed(
  () => Number(appStore.selectedRobotId) || (robots.length > 0 ? robots[0].id : 0)
)
const current = computed<RobotStatus | undefined>(() =>
  robots.find((r) => r.id === selectedId.value)
)
// 为模板提供已解包的派生值，优先使用实时状态
const currentLng = computed<number>(
  () => fishControlStore.currentStatus?.lng ?? current.value?.lng ?? 0
)
const currentLat = computed<number>(
  () => fishControlStore.currentStatus?.lat ?? current.value?.lat ?? 0
)
const currentDepth = computed<number>(
  () => fishControlStore.currentStatus?.depth ?? current.value?.depth ?? 0
)
const currentAltitude = computed<number>(
  () => fishControlStore.currentStatus?.altitude ?? current.value?.altitude ?? 0
)
const currentBattery = computed<number>(
  () => fishControlStore.currentStatus?.battery ?? current.value?.battery ?? 0
)
const currentYaw = computed<number>(
  () => fishControlStore.currentStatus?.yaw ?? current.value?.yaw ?? 0
)
const currentPitch = computed<number>(
  () => fishControlStore.currentStatus?.pitch ?? current.value?.pitch ?? 0
)
const currentRoll = computed<number>(
  () => fishControlStore.currentStatus?.roll ?? current.value?.roll ?? 0
)
const currentAcoustic = computed<SignalLevel>(
  () =>
    (fishControlStore.currentStatus?.acoustic as SignalLevel) ?? current.value?.acoustic ?? 'weak'
)
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
      const statusList: RobotStatus[] = list.map((f) => ({
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
  const handler = (
    _evt: unknown,
    payload: { time?: string; csq?: number; raw?: string; port?: string }
  ) => {
    try {
      const timeStr = payload?.time ?? ''
      const csq = payload?.csq ?? ''
      const dt = timeStr ? timeStr.replace('_', ' ') : ''
      ElMessageBox.alert(t('screen.surfSuccessAlert', { time: dt, csq: csq }), t('common.tips'), {
        type: 'success'
      })
    } catch {
      /* ignore */
    }
  }
  ipc.on('serial:surf', handler)
  removeSurfListener = () => ipc.removeListener('serial:surf', handler)
  // 启动轮询
  updateGamepads()
})

onBeforeUnmount(() => {
  removeSurfListener?.()
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})

// ---------------------- 摇杆控制逻辑开始 ----------------------
let animationFrameId: number | null = null
const lastSentTime = ref(0)
const JOYSTICK_THROTTLE = 1000 // 1秒防抖

function updateGamepads() {
  const gamepads = navigator.getGamepads()
  if (!gamepads) return

  for (const gp of gamepads) {
    if (!gp) continue

    // 防抖检查
    const now = Date.now()
    if (now - lastSentTime.value < JOYSTICK_THROTTLE) continue

    // 读取轴数据
    // Axis 0: 左/右 (负数向左, 正数向右)
    // Axis 1: 前/后 (负数向前, 正数向后 - 需根据实际设备测试反转)
    // Axis 3: 上浮/下潜 (假设: 负数上浮, 正数下潜)
    const axisLeftRight = gp.axes[0] || 0
    const axisForwardBack = gp.axes[1] || 0
    const axisSurfDive = gp.axes[3] || 0
    const DEADZONE = 0.5 // 死区

    let cmd = ''

    // 优先级：上浮/下潜 > 前后 > 左右
    if (Math.abs(axisSurfDive) > DEADZONE) {
      // Axis 3: > 0.5 下潜 (Dive), < -0.5 上浮 (Surf)
      if (axisSurfDive > DEADZONE) cmd = 'dive'
      else if (axisSurfDive < -DEADZONE) cmd = 'surf'
    } else if (Math.abs(axisForwardBack) > DEADZONE) {
      // Axis 1: > 0.5 向后/返航 (Return), < -0.5 向前 (Forward)
      if (axisForwardBack > DEADZONE) cmd = '' // 向后映射为返航
      else if (axisForwardBack < -DEADZONE) cmd = 'forward'
    } else if (Math.abs(axisLeftRight) > DEADZONE) {
      if (axisLeftRight < -DEADZONE) cmd = 'left'
      else if (axisLeftRight > DEADZONE) cmd = 'right'
    } else if (gp.buttons[14]?.pressed) {
      cmd = 'lightOn'
    } else if (gp.buttons[15]?.pressed) {
      cmd = 'lightOff'
    }

    if (cmd) {
      console.log(`[Joystick] Detected command: ${cmd}`)

      // 执行对应指令
      switch (cmd) {
        case 'forward':
          moveForward()
          break
        // case 'return':
        //   returnHome() // 向后 -> 返航
        //   break
        case 'left':
          moveLeft()
          break
        case 'right':
          moveRight()
          break
        case 'surf':
          controlSurf()
          break
        case 'dive':
          controlDive()
          break
        case 'lightOn':
          setLight(true)
          break
        case 'lightOff':
          setLight(false)
          break
      }

      lastSentTime.value = now
    }
  }

  animationFrameId = requestAnimationFrame(updateGamepads)
}
// ---------------------- 摇杆控制逻辑结束 ----------------------

// 控制台交互（示例逻辑，可替换为与设备通讯的指令）·
function controlUp(): void {
  console.log('[tap] up')
  ElMessage.success(t('screen.upSent'))
  void fishControlStore.sendCommand('up')
}
function controlDown(): void {
  console.log('[tap] down')
  ElMessage.success(t('screen.downSent'))
  void fishControlStore.sendCommand('down')
}
function controlDive(): void {
  console.log('[tap] dive')
  // Store handles the serial logic and messages
  ElMessage.success(t('screen.diveSent'))
  void fishControlStore.sendCommand('dive')
}
function controlSurf(): void {
  console.log('[tap] surf')
  ElMessage.success(t('screen.surfSent'))
  void fishControlStore.sendCommand('surf')
}
function moveForward(): void {
  console.log('[tap] forward')
  ElMessage.success(t('screen.forwardSent'))
  void fishControlStore.sendCommand('forward')
}
function moveLeft(): void {
  console.log('[tap] left')
  ElMessage.success(t('screen.leftSent'))
  void fishControlStore.sendCommand('left')
}
function moveRight(): void {
  console.log('[tap] right')
  ElMessage.success(t('screen.rightSent'))
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
const controlDiveDebounced = debounce(controlDive, 300)
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
  ElMessage.success(t('screen.manualSent'))
  void fishControlStore.sendCommand('manual')
}

// 导航弹窗相关状态
const navigateDialogVisible = ref(false)
const navigateTrack = ref<TrackPoint[]>([])
const trackErrors = ref<number[]>([])
const trackErrorDesc = computed(() =>
  trackErrors.value.length
    ? `${t('common.error')}：${trackErrors.value.map((i) => i + 1).join(', ')}`
    : ''
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

watch(navigateTrack, () => recomputeTrackErrors(), { deep: true })

async function enableNavigate(): Promise<void> {
  const currentFish = fishControlStore.currentFish
  console.log('enableNavigate', currentFish)
  if (!currentFish) {
    ElMessage.warning(t('login.placeholderRobot'))
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
      ElMessage.error(t('history.fetchFail'))
    }
  } catch (error) {
    console.error('获取机器鱼数据出错:', error)
    ElMessage.error(t('history.fetchFail'))
  }
}

async function confirmNavigate(): Promise<void> {
  const currentFish = fishControlStore.currentFish
  if (!currentFish) return

  // 校验
  recomputeTrackErrors()
  if (trackErrors.value.length) {
    ElMessage.error(t('fish.trackError'))
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

    ElMessage.success(t('screen.trackSaved'))
    // Start complex navigation flow (Navigate -> Wait -> Upload Trajectory)
    // Map UI TrackPoint to Store TrackPoint
    const storeTrack = cleanTrack.map((p) => ({
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
    ElMessage.error(t('fish.saveFail'))
  }
}

function setLight(on: boolean): void {
  lightOn.value = on
  ElMessage.success(on ? t('screen.lightOn') : t('screen.lightOff'))
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
  ElMessage.success(t('screen.returnSent'))

  void fishControlStore.sendCommand('return')
}

import type { Alert } from '@prisma/client'

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

  const progressHandler = (
    _evt: unknown,
    payload: { imageId: string; current: number; total: number; filename: string }
  ) => {
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

function levelClass(level: string): string {
  return level === '01' ? 'lv-high' : 'lv-low'
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
      pageSize: 100,
      fromSocket: true
    })
    const items = Array.isArray(res?.items) ? res.items : []
    console.log('items', items)
    // 按照 createdAt 倒序排序
    items.sort(
      (a: AlertItem, b: AlertItem) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    const top100 = items.slice(0, 100)
    alerts.splice(0, alerts.length, ...top100)
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
    ElMessage.warning(t('screen.receiving', { current: p.current, total: p.total }))
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
    ElMessage.warning(t('screen.pleaseSurf'))
    const imageName = a.imgFile
      ? a.imgFile.split('/').pop() || `fm_${new Date().toISOString().replace(/[-:.TZ]/g, '')}.jpg`
      : `fm_${new Date().toISOString().replace(/[-:.TZ]/g, '')}.jpg`
    try {
      // 从COM口发送PICSTART命令
      const command = `PICSTART ${imageName}`
      const ok = await (window as any).api?.serial?.write?.(command)
      if (ok) {
        ElMessage.success(t('screen.picStartSent', { cmd: command }))
      } else {
        ElMessage.error(t('screen.picStartFail'))
      }
    } catch (e) {
      console.error('发送PICSTART命令出错:', e)
      ElMessage.error(t('screen.picStartFail'))
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
type VideoMode = 'microwaveMono' | 'microwaveStereo' | 'starlinkMono' | 'starlinkStereo'
const videoDialogVisible = ref(false)
const videoMode = ref<VideoMode>('microwaveMono')
const videoLoading = ref(false)

// 切换视频流的封装逻辑
async function switchVideoStream(mode: VideoMode): Promise<void> {
  if (!current.value) return

  try {
    // 1. 销毁播放器，断开旧连接
    showVideoPlayer.value = false
    videoLoading.value = true

    // 2. 请求后端切换流
    const result = await window.electron.ipcRenderer.invoke(
      'rtsp:start',
      current.value.id,
      mode
    )

    if (result.success) {
      console.log(`已切换到${mode}视频流`)
    } else {
      console.error('切换RTSP流类型失败:', result.message)
      ElMessage.error(t('screen.switchVideoFail', { msg: result.message }))
    }
  } catch (error) {
    console.error('切换RTSP流类型失败:', error)
    ElMessage.error(t('screen.checkConnect'))
  } finally {
    // 3. 延迟重建播放器，确保后端流就绪
    setTimeout(() => {
      // 如果弹窗已关闭，不再显示播放器
      if (!videoDialogVisible.value) return
      videoLoading.value = false
      showVideoPlayer.value = true
    }, 500)
  }
}

// 监听videoMode变化，切换RTSP流类型
watch(videoMode, (newMode) => {
  if (videoDialogVisible.value) {
    void switchVideoStream(newMode)
  }
})

// 使用本地示例视频，同时作为单目与双目演示源
const currentVideoTitle = computed((): string => t('screen.videoDialogTitle'))
const showVideoPlayer = ref(true)

function openVideo(mode: VideoMode): void {
  videoDialogVisible.value = true
  // 如果模式不同，赋值会触发 watch -> switchVideoStream
  if (videoMode.value !== mode) {
    videoMode.value = mode
  } else {
    // 如果模式相同，watch 不触发，需手动强制刷新
    void switchVideoStream(mode)
  }
}

function onVideoDialogClose(): void {
  showVideoPlayer.value = false
  videoLoading.value = false
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
      openVideo('microwaveMono')
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

async function fetchFishData(
  id: number,
  _prevRoute: RoutePoint[]
): Promise<{ info: RobotStatus; route: RoutePoint[]; alarm: AlertItem[] }> {
  // 获取真实鱼数据
  const fish = await window.api.fish.findById(Number(id))
  if (!fish) {
    throw new Error('Fish not found in database')
  }
  const base = robots.find((r) => r.id === id) ?? robots[0]

  // Update store's current fish if changed, to enable real-time connection context
  if (fishControlStore.currentFish?.id !== fish.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fishControlStore.setCurrentFish(fish as any)
  }

  // 优先使用实时状态（声通数据），否则使用数据库中的声通基准或内存中的最后状态
  const store = fishControlStore.currentFish?.id === id ? fishControlStore.currentStatus : null
  // 辅助函数：优先取实时值，其次取数据库值，最后取默认值
  const val = (rt: number | undefined, db: number | null | undefined, def: number): number => {
    if (rt !== undefined && rt !== null) return rt
    if (db !== undefined && db !== null) return db
    return def
  }

  const nextLng = val(store?.lng, fish.acousticLon, base?.lng || 0)
  const nextLat = val(store?.lat, fish.acousticLat, base?.lat || 0)
  const nextDepth = store?.depth ?? base?.depth ?? 0
  const nextAltitude = store?.altitude ?? base?.altitude ?? 0
  const nextYaw = store?.yaw ?? base?.yaw ?? 0
  const nextPitch = store?.pitch ?? base?.pitch ?? 0
  const nextRoll = store?.roll ?? base?.roll ?? 0
  const nextBattery = store?.battery ?? base?.battery ?? 100
  const nextAcoustic: SignalLevel = (store?.acoustic as SignalLevel) ?? base?.acoustic ?? 'weak'

  const info: RobotStatus = {
    id: fish.id,
    name: fish.name,
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

  // 获取真实轨迹
  let route: RoutePoint[] = []
  if (Array.isArray(fish.track)) {
    route = (fish.track as any[]).map((p) => ({
      lng: Number(p.lon ?? p.lng ?? 0),
      lat: Number(p.lat ?? 0),
      altitude: Number(p.alt ?? p.altitude ?? 0),
      depth: Number(p.depth ?? 0)
    }))
  }

  // 报警：读取最近2小时的报警
  const now = new Date()
  const startTime = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  const endTime = now.toISOString()

  let alarm: AlertItem[] = []
  try {
    const res = await window.api.alert.list({
      page: 1,
      pageSize: 50,
      startTime,
      endTime
    })
    alarm = res.items
  } catch (e) {
    console.error('Fetch alarms failed:', e)
  }

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
      try {
        await loadBMapGL(AK)
      } catch (e) {
        console.warn('First attempt to load Baidu Map failed, retrying...', e)
        // 失败后等待 1 秒重试
        await new Promise((resolve) => setTimeout(resolve, 1000))
        try {
          await loadBMapGL(AK)
        } catch (retryErr) {
          console.error('Retry loading Baidu Map failed:', retryErr)
        }
      }
    }

    const BMap = (window as { BMap?: unknown }).BMap as BMap2DApi | undefined
    if (BMap) {
      // 确保 DOM 已渲染
      await new Promise((resolve) => setTimeout(resolve, 100))

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

      // 初始化加载选中鱼的数据并绘制
      await loadSelectedFishData(true)

      // 点击地图不产生任何效果（按照需求移除点击处理）

      // 轮询最新数据
      pollTimer = window.setInterval((): void => {
        void loadSelectedFishData(false)
      }, 3000)

      // 拉取报警并启动轮询（30秒）
      await fetchAlertsAndUpdate()
      if (alertPollTimer) {
        clearInterval(alertPollTimer)
        alertPollTimer = null
      }
      alertPollTimer = window.setInterval(() => {
        void fetchAlertsAndUpdate()
      }, 30000)
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
          <div class="section-title">{{ t('screen.basicInfo') }}</div>
          <div class="status-grid">
            <div class="stat-card">
              <div class="stat-value">{{ Number(currentLng).toFixed(6) }}°</div>
              <div class="stat-label">{{ t('history.lon') }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ Number(currentLat).toFixed(6) }}°</div>
              <div class="stat-label">{{ t('history.lat') }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentDepth }}m</div>
              <div class="stat-label">{{ t('history.depth') }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentAltitude }}m</div>
              <div class="stat-label">{{ t('history.height') }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentBattery }}%</div>
              <div class="stat-label">{{ t('history.battery') }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentYaw }}°</div>
              <div class="stat-label">{{ t('history.yaw') }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentPitch }}°</div>
              <div class="stat-label">{{ t('history.pitch') }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ currentRoll }}°</div>
              <div class="stat-label">{{ t('history.roll') }}</div>
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
                    currentAcoustic === 'strong'
                      ? t('screen.strong')
                      : currentAcoustic === 'medium'
                        ? t('screen.medium')
                        : t('screen.weak')
                  }}
                </span>
              </div>
              <div class="stat-label">{{ t('screen.acousticSignal') }}</div>
            </div>
          </div>
        </div>

        <div class="panel-card alerts-card">
          <div class="section-header">
            <div class="section-title">{{ t('screen.alertInfo') }}</div>
            <button class="section-more" type="button" :title="t('screen.viewHistory')" @click="goHistory()">
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
                  <span v-if="a.imgFile">
                    {{ a.imgFile.split(/[/\\]/).pop() }}
                  </span>
                  &nbsp; &nbsp;
                  <span v-if="a.imageBase64" class="alert-image-icon">📷</span>
                  <span v-else-if="a.imgFile && imageProgress[a.imgFile]" class="alert-image-icon"
                    style="font-size: 0.8em; color: #e6a23c">
                    ⏳ {{ imageProgress[a.imgFile].current }}/{{ imageProgress[a.imgFile].total }}
                  </span>
                  <span v-else-if="a.imgFile" class="alert-image-icon">📷</span>
                </div>
                <div class="alert-sub">
                  <span> {{ formatTime(a.createdAt.toString()) }} &nbsp; &nbsp;</span>
                  {{ t('history.lon') }} {{ Number(a.lon ?? 0).toFixed(6) }} ·
                  {{ t('history.lat') }} {{ Number(a.lat ?? 0).toFixed(6) }}
                </div>
              </div>
              <div class="alert-level" :class="levelClass(a.level || '')">
                {{ a.level === '01' ? t('screen.strong') : t('screen.weak') }}
              </div>
            </div>
          </div>
        </div>

        <div class="panel-card">
          <div class="section-title">{{ t('screen.console') }}</div>
          <div class="actions-grid">
            <!-- 方向控制 -->
            <button class="action-btn primary" @click="moveForwardDebounced">
              <span class="icon">↑</span><span class="text">{{ t('screen.forward') }}</span>
            </button>
            <button class="action-btn primary" @click="moveLeftDebounced">
              <span class="icon">←</span><span class="text">{{ t('screen.left') }}</span>
            </button>
            <button class="action-btn primary" @click="moveRightDebounced">
              <span class="icon">→</span><span class="text">{{ t('screen.right') }}</span>
            </button>
            <!-- 垂直运动 -->
            <button class="action-btn accent" @click="controlUpDebounced">
              <span class="icon">⤒</span><span class="text">{{ t('screen.up') }}</span>
            </button>
            <button class="action-btn accent" @click="controlDownDebounced">
              <span class="icon">⤓</span><span class="text">{{ t('screen.down') }}</span>
            </button>
            <button class="action-btn accent" @click="controlDiveDebounced">
              <span class="icon">⤓</span><span class="text">{{ t('screen.dive') }}</span>
            </button>
            <!-- 模式/返航/上浮 -->
            <button class="action-btn warn" @click="enableManualDebounced">
              <span class="icon">⚙️</span><span class="text">{{ t('screen.manual') }}</span>
            </button>
            <button class="action-btn info" @click="returnHomeDebounced">
              <span class="icon">🏠</span><span class="text">{{ t('screen.return') }}</span>
            </button>
            <button class="action-btn accent" @click="controlSurfDebounced">
              <span class="icon">⤒</span><span class="text">{{ t('screen.surf') }}</span>
            </button>
            <!-- 功耗与灯光 -->
            <button class="action-btn warn" @click="enableNavigateDebounced">
              <span class="icon">🌙</span><span class="text">{{ t('screen.navigate') }}</span>
            </button>
            <button class="action-btn info" @click="setLightOnDebounced">
              <span class="icon">💡</span><span class="text">{{ t('screen.lightOn') }}</span>
            </button>
            <button class="action-btn info" @click="setLightOffDebounced">
              <span class="icon">💡</span><span class="text">{{ t('screen.lightOff') }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- 视频查看弹窗：微波/星链 单目/双目切换 -->
    <el-dialog v-model="videoDialogVisible" :title="currentVideoTitle" width="60%" class="video-dialog"
      @close="onVideoDialogClose">
      <div class="video-toolbar">
        <el-button-group>
          <el-button type="primary" :plain="videoMode !== 'microwaveMono'" :loading="videoLoading"
            @click="videoMode = 'microwaveMono'">{{ t('screen.microwaveMono') }}</el-button>
          <el-button type="primary" :plain="videoMode !== 'microwaveStereo'" :loading="videoLoading"
            @click="videoMode = 'microwaveStereo'">{{ t('screen.microwaveStereo') }}</el-button>
        </el-button-group>
        <el-divider direction="vertical" />
        <el-button-group>
          <el-button type="success" :plain="videoMode !== 'starlinkMono'" :loading="videoLoading"
            @click="videoMode = 'starlinkMono'">{{ t('screen.starlinkMono') }}</el-button>
          <el-button type="success" :plain="videoMode !== 'starlinkStereo'" :loading="videoLoading"
            @click="videoMode = 'starlinkStereo'">{{ t('screen.starlinkStereo') }}</el-button>
        </el-button-group>
      </div>
      <div class="video-body">
        <div :class="['video-container', { 'video-loading': videoLoading }]">
          <el-loading v-loading="videoLoading" :text="t('screen.switchVideo')" background="rgba(0, 0, 0, 0.8)">
            <template v-if="showVideoPlayer">
              <VideoPlayerJSMpeg url="ws://localhost:8085/" />
            </template>
            <template v-else>
              <div class="video-placeholder">
                {{ t('screen.videoPlaceholder', { title: currentVideoTitle }) }}
              </div>
            </template>
          </el-loading>
        </div>
      </div>
    </el-dialog>
    <!-- 报警图片弹窗：有图则直接展示 -->
    <el-dialog v-model="alertImageDialogVisible" :title="t('screen.alertImage')" width="50%" class="image-dialog">
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
            {{ t('screen.noAlertImage') }}
          </div>
        </template>
      </div>
    </el-dialog>
    <!-- 导航弹窗 -->
    <el-dialog v-model="navigateDialogVisible" :title="t('screen.navigateDialogTitle')" width="800px"
      class="navigate-dialog">
      <div class="dialog-content">
        <div style="margin-bottom: 8px">
          <el-button type="primary" plain @click="addTrackPoint">{{
            t('fish.addTrackPoint')
          }}</el-button>
        </div>
        <el-table :data="navigateTrack" border stripe style="width: 100%" size="small" max-height="400">
          <el-table-column :label="t('history.lon')">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].lon" :min="-180" :max="180" :step="0.0001" :precision="4"
                controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column :label="t('history.lat')">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].lat" :min="-90" :max="90" :step="0.0001" :precision="4"
                controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column :label="t('history.height')">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].alt" :min="0" :step="0.01" :precision="2"
                controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column :label="t('history.depth')">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].depth" :min="0" :step="0.01" :precision="2"
                controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column :label="t('common.operation')" width="80" fixed="right">
            <template #default="{ $index }">
              <el-button size="small" type="danger" plain @click="removeTrackPoint($index)">{{
                t('common.delete')
              }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="trackErrors.length" style="margin-top: 8px">
          <el-alert type="error" show-icon :closable="false" :title="t('fish.trackError')"
            :description="trackErrorDesc" />
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="navigateDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="confirmNavigate">{{
            t('screen.saveAndNavigate')
          }}</el-button>
        </span>
      </template>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
