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
const AK = 'a2HDfXdiPuz56AH2Ng3JtebA8r6NOkkK'
// 使用项目静态资源作为标注图标
const fishIconUrl = new URL('../../assets/images/fish.svg', import.meta.url).href

// 最小类型定义，覆盖当前使用到的构造与方法，避免使用 any
type BMapLabel = {
  setContent: (content: string) => void
  setStyle: (style: Record<string, string | number>) => void
}

type BMapMarker = {
  setPosition: (point: unknown) => void
  setIcon: (icon: unknown) => void
  setZIndex: (index: number) => void
  getLabel: () => BMapLabel | null
  setLabel: (label: BMapLabel) => void
  addEventListener: (event: string, handler: () => void) => void
}

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
  Marker: new (point: unknown, opts?: unknown) => BMapMarker
  Icon: new (url: string, size?: unknown, opts?: unknown) => unknown
  Label: new (content: string, opts?: unknown) => BMapLabel
  Size: new (w: number, h: number) => unknown
  Polyline: new (points: unknown[], opts?: unknown) => unknown
}

// 扩展 RobotStatus 以包含是否显示
interface EnhancedRobotStatus extends RobotStatus {
  showOnMap: boolean
  lastUpdate: number
  track?: TrackPoint[]
}

const toTrackPoints = (json: unknown): TrackPoint[] => {
  if (!json) return []
  let data = json
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  return (data as unknown[]).map((tp) => {
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

const robots = reactive<EnhancedRobotStatus[]>([])
const selectedId = ref<number>(0)

const currentFish = computed(() => fishControlStore.currentFish)

// 同步 selectedId 到 store (如果还需要 store)
watch(selectedId, (val) => {
  appStore.setSelectedRobotId(val)
})

const current = computed<EnhancedRobotStatus | undefined>(() =>
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
  const w = window as { BMap?: BMap2DApi }
  if (w.BMap && w.BMap.Map && w.BMap.Point) {
    return w.BMap
  }
  return undefined
}

const initialTargetDialogVisible = ref(false)
const initialTargetLon = ref<number>(0)
const initialTargetLat = ref<number>(0)

function openInitialTargetDialog(): void {
  initialTargetDialogVisible.value = true

  // 从当前选中鱼获取初始目标点
  const fish = fishControlStore.currentFish
  if (fish) {
    if (fish.initialLon !== undefined && fish.initialLon !== null) {
      initialTargetLon.value = fish.initialLon
    }
    if (fish.initialLat !== undefined && fish.initialLat !== null) {
      initialTargetLat.value = fish.initialLat
    }
  }

  if (initialTargetLon.value === 0 && initialTargetLat.value === 0) {
    initialTargetLon.value = 0
    initialTargetLat.value = 0
  }
}

async function confirmInitialTarget(): Promise<void> {
  const lonStr = initialTargetLon.value.toFixed(7)
  const latStr = initialTargetLat.value.toFixed(7)
  await fishControlStore.sendInitialTarget(lonStr, latStr)
  initialTargetDialogVisible.value = false
}

// 标注集合
const markers: Map<number, BMapMarker> = new Map()

// 更新单个鱼的最新位置信息
async function updateFishStatus(fish: any, status: EnhancedRobotStatus): Promise<void> {
  try {
    // 获取最新历史记录
    const historyRes = await window.api.history.list({
      // @ts-ignore: fishId added in d.ts
      fishId: fish.id,
      page: 1,
      pageSize: 1
    })
    const latestHistory = historyRes.items[0]

    // 比较时间
    const fishTime = new Date(fish.updatedAt).getTime()
    const historyTime = latestHistory ? new Date(latestHistory.time).getTime() : 0

    // 默认使用 fish 表中的初始位置
    let lng = fish.initialLon || 0
    let lat = fish.initialLat || 0
    let lastUpdate = fishTime

    // 如果历史记录更新，则使用历史记录
    if (historyTime > fishTime && latestHistory.lon && latestHistory.lat) {
      lng = latestHistory.lon
      lat = latestHistory.lat
      lastUpdate = historyTime
    } else if (fish.initialLon && fish.initialLat) {
      // 显式使用 initial
      lng = fish.initialLon
      lat = fish.initialLat
    }

    // 更新状态
    status.lng = lng
    status.lat = lat
    status.lastUpdate = lastUpdate
    if (latestHistory) {
      status.depth = latestHistory.depth ?? 0
      status.altitude = latestHistory.height ?? 0
      status.battery = latestHistory.battery ?? 0
      status.yaw = latestHistory.yawDeg ?? 0
      status.pitch = latestHistory.pitchDeg ?? 0
      status.roll = latestHistory.rollDeg ?? 0
    }
  } catch (e) {
    console.error(`Failed to update status for fish ${fish.id}`, e)
  }
}

// 刷新所有鱼的状态和地图标注
async function refreshAll(): Promise<void> {
  const list = await window.api.fish.findAll()
  // 同步 robots 列表
  // 这里简化处理：直接重建 robots 列表，或者更新现有
  // 为了保留响应性，我们尽量更新
  const idMap = new Map(list.map(f => [f.id, f]))

  // 移除不存在的
  for (let i = robots.length - 1; i >= 0; i--) {
    if (!idMap.has(robots[i].id)) {
      robots.splice(i, 1)
    }
  }

  // 添加/更新
  for (const f of list) {
    let r = robots.find(r => r.id === f.id)
    if (!r) {
      r = {
        id: f.id,
        name: f.name,
        battery: 0,
        depth: 0,
        altitude: 0,
        yaw: 0,
        pitch: 0,
        roll: 0,
        lng: 0,
        lat: 0,
        acoustic: 'weak',
        // @ts-ignore: showOnMap exists
        showOnMap: f.showOnMap ?? true,
        lastUpdate: 0,
        // @ts-ignore: track exists
        track: toTrackPoints(f.track)
      }
      robots.push(r)
    } else {
      r.name = f.name
      // @ts-ignore: showOnMap exists
      r.showOnMap = f.showOnMap ?? true
      // @ts-ignore: track exists
      r.track = toTrackPoints(f.track)
    }
    // 更新位置数据
    await updateFishStatus(f, r)
  }

  // 绘制地图标注
  renderMarkers()
  renderTrajectory()
}

let currentPolyline: unknown = null

function renderTrajectory(): void {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const map = mapInstance

  // 移除旧的轨迹线
  if (currentPolyline) {
    map.removeOverlay(currentPolyline)
    currentPolyline = null
  }

  const r = robots.find((item) => item.id === selectedId.value)
  if (!r || !r.track || r.track.length === 0) return

  if (!r.showOnMap) return

  const points = r.track.map((p) => new BMap.Point(p.lon, p.lat))
  const polyline = new BMap.Polyline(points, {
    strokeColor: 'red',
    strokeWeight: 3,
    strokeOpacity: 0.8
  })

  map.addOverlay(polyline)
  currentPolyline = polyline
}

function renderMarkers(): void {
  const BMap = getBMap()
  if (!BMap || !mapInstance) return
  const map = mapInstance

  // 清理无效标注
  const activeIds = new Set(robots.map(r => r.id))
  for (const [id, marker] of markers.entries()) {
    if (!activeIds.has(id)) {
      map.removeOverlay(marker)
      markers.delete(id)
    }
  }

  robots.forEach(r => {
    if (!r.showOnMap) {
      if (markers.has(r.id)) {
        map.removeOverlay(markers.get(r.id))
        markers.delete(r.id)
      }
      return
    }

    const isSelected = r.id === selectedId.value
    const point = new BMap.Point(r.lng, r.lat)
    const zIndex = isSelected ? 999 : 100

    // 图标样式
    let icon
    if (isSelected) {
      // 绿色/选中：使用 fishIcon (大)
      icon = new BMap.Icon(fishIconUrl, new BMap.Size(48, 48), {
        imageSize: new BMap.Size(48, 48),
        anchor: new BMap.Size(24, 24)
      })
    } else {
      // 未选中：也使用 fishIcon (小)
      icon = new BMap.Icon(fishIconUrl, new BMap.Size(32, 32), {
        imageSize: new BMap.Size(32, 32),
        anchor: new BMap.Size(16, 16)
      })
    }

    let marker = markers.get(r.id)
    if (marker) {
      // 更新位置和图标
      marker.setPosition(point)
      marker.setIcon(icon)
      marker.setZIndex(zIndex)
      // 更新 Label
      const label = marker.getLabel()
      if (label) {
        label.setContent(r.name)
        label.setStyle(
          isSelected
            ? {
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '14px',
                border: '2px solid transparent',
                borderRadius: '6px',
                background:
                  'linear-gradient(#1f2230, #1f2230) padding-box, linear-gradient(135deg, #00C6FB 0%, #005BEA 100%) border-box',
                padding: '4px 8px',
                boxShadow: '0 2px 10px rgba(0, 91, 234, 0.5)',
                zIndex: '1000'
              }
            : {
                color: '#eeeeee',
                fontWeight: 'normal',
                fontSize: '12px',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                background: 'rgba(0,0,0,0.6)',
                padding: '2px 4px',
                boxShadow: 'none',
                zIndex: 'auto'
              }
        )
      }
    } else {
      // 创建新标注
      marker = new BMap.Marker(point, { icon })
      marker.setZIndex(zIndex)

      // 添加 Label
      const label = new BMap.Label(r.name, {
        offset: new BMap.Size(-20, -25)
      })
      label.setStyle(
        isSelected
          ? {
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '14px',
              border: '2px solid transparent',
              borderRadius: '6px',
              background:
                'linear-gradient(#1f2230, #1f2230) padding-box, linear-gradient(135deg, #00C6FB 0%, #005BEA 100%) border-box',
              padding: '4px 8px',
              boxShadow: '0 2px 10px rgba(0, 91, 234, 0.5)',
              zIndex: '1000'
            }
          : {
              color: '#eeeeee',
              fontWeight: 'normal',
              fontSize: '12px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              background: 'rgba(0,0,0,0.6)',
              padding: '2px 4px',
              boxShadow: 'none',
              zIndex: 'auto'
            }
      )
      marker.setLabel(label)

      // 点击事件：选中
      marker.addEventListener('click', () => {
        // 切换选中鱼
        const fish = fishControlStore.fishMap.get(r.id)
        if (fish) {
            fishControlStore.setCurrentFish(fish)
        }
      })

      map.addOverlay(marker)
      markers.set(r.id, marker)
    }
  })
}

// 监听全局选中变化
watch(() => fishControlStore.activeFishId, (newId) => {
    if (newId && newId !== selectedId.value) {
        selectedId.value = newId
    }
}, { immediate: true })

// 监听选中变化（保留本地逻辑，但不需要重复调用 setCurrentFish，因为如果是由地图点击触发，已经切换了）
watch(selectedId, (newId) => {
  // 如果当前 Store 中的 activeId 不是 newId，则同步
  if (fishControlStore.activeFishId !== newId) {
      window.api.fish.findById(newId).then(fish => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (fish) fishControlStore.setCurrentFish(fish as any)
      })
  }

  // 重绘 Marker 样式
  renderMarkers()
  renderTrajectory()

  // 居中地图
  const target = robots.find(r => r.id === newId)
  if (target && mapInstance) {
    const BMap = getBMap()
    if (BMap) {
      const point = new BMap.Point(target.lng, target.lat)
      mapInstance.centerAndZoom(point, 14)
    }
  }
})

onMounted(async (): Promise<void> => {
  await refreshAll()

  // 默认选中第一个
  if (robots.length > 0 && !selectedId.value) {
    selectedId.value = robots[0].id
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
  ): void => {
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

function updateGamepads(): void {
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
  showCommandToast('up')
  void fishControlStore.sendCommand('up')
}
function controlDown(): void {
  console.log('[tap] down')
  showCommandToast('down')
  void fishControlStore.sendCommand('down')
}
function controlDive(): void {
  console.log('[tap] dive')
  // Store handles the serial logic and messages
  showCommandToast('dive')
  void fishControlStore.sendCommand('dive')
}
function controlSurf(): void {
  console.log('[tap] surf')
  showCommandToast('surf')
  void fishControlStore.sendCommand('surf')
}
function moveForward(): void {
  console.log('[tap] forward')
  showCommandToast('forward')
  void fishControlStore.sendCommand('forward')
}
function moveLeft(): void {
  console.log('[tap] left')
  showCommandToast('left')
  void fishControlStore.sendCommand('left')
}
function moveRight(): void {
  console.log('[tap] right')
  showCommandToast('right')
  void fishControlStore.sendCommand('right')
}

// 辅助函数：显示即将发送的命令
function showCommandToast(cmdType: string): void {
  const fish = fishControlStore.currentFish
  if (!fish) return

  let cmdStr = ''
  // 简单映射，仅为了显示提示，不涉及实际发送逻辑（实际逻辑在 store/main process）
  // 注意：这里仅尽可能匹配 store 中的逻辑来展示
  // 如果是 'dive' (Iridium DONE)，其他默认 Acoustic
  if (cmdType === 'dive') {
    cmdStr = 'DONE' // Iridium command
  } else {
    // Acoustic
    // 尝试从 fish 对象中获取自定义命令，如果存在
    switch (cmdType) {
      case 'forward': cmdStr = fish.forwardCommand || 'FORWARD'; break
      case 'left': cmdStr = fish.leftCommand || 'LEFT'; break
      case 'right': cmdStr = fish.rightCommand || 'RIGHT'; break
      case 'up': cmdStr = fish.upCommand || 'UP'; break
      case 'down': cmdStr = fish.downCommand || 'DOWN'; break
      case 'surf': cmdStr = fish.surfCommand || 'SURF'; break
      case 'manual': cmdStr = fish.manualCommand || 'MAN'; break
      case 'return': cmdStr = fish.returnCommand || 'RETURN'; break
      case 'navigate': cmdStr = fish.navigateCommand || 'NAVIGATE'; break
      case 'lightOn': cmdStr = fish.lightOnCommand || 'LIGHTON'; break
      case 'lightOff': cmdStr = fish.lightOffCommand || 'LIGHTOFF'; break
      case 'wifi': cmdStr = fish.wifiCommand || 'WIFI'; break
      case 'wifiOff': cmdStr = fish.wifiOffCommand || 'WIFIOFF'; break
      case 'ascend': cmdStr = fish.ascendCommand || 'UP'; break
      case 'descend': cmdStr = fish.descendCommand || 'DOWN'; break
      default: cmdStr = cmdType.toUpperCase(); break
    }

    // 如果是 Acoustic 且是默认简写，尝试构建完整 AT 指令格式用于展示 (模拟 CommandGenerator.buildAcoustic)
    // 格式: +++AT*SENDIM,<len>,<targetId>,ack,<content>
    // 这里仅做展示，简化处理
    if (!cmdStr.startsWith('+++AT')) {
       const targetId = fish.acousticId || '02'
       cmdStr = `+++AT*SENDIM,${cmdStr.length},${targetId},ack,${cmdStr}`
    }
  }

  ElMessage.info(`Sending: ${cmdStr}`)
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
  showCommandToast('manual')
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
    const cleanTrack = navigateTrack.value.map((p) => ({
      lon: Math.round(p.lon * 1e6) / 1e6,
      lat: Math.round(p.lat * 1e6) / 1e6,
      alt: p.alt,
      depth: p.depth
    }))

    await window.api.fish.update(currentFish.id, {
      track: cleanTrack
    })

    // 更新本地 robots 数据，以便立即刷新地图轨迹
    const r = robots.find((item) => item.id === currentFish.id)
    if (r) {
      r.track = cleanTrack.map((p) => ({
        lon: p.lon,
        lat: p.lat,
        alt: p.alt ?? null,
        depth: p.depth ?? null
      }))
      renderTrajectory()
    }

    ElMessage.success(t('screen.trackSaved'))
    const storeTrack = cleanTrack.map((p) => ({
      lon: p.lon,
      lat: p.lat,
      alt: p.alt,
      depth: p.depth
    }))

    void fishControlStore.sendTrajectory(storeTrack)

    navigateDialogVisible.value = false
  } catch (error) {
    console.error('保存轨迹失败:', error)
    ElMessage.error(t('fish.saveFail'))
  }
}

function setLight(on: boolean): void {
  lightOn.value = on
  void fishControlStore.sendCommand(on ? 'lightOn' : 'lightOff')
}
function returnHome(): void {
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
  ): void => {
    if (payload.filename) {
      imageProgress[payload.filename] = { current: payload.current, total: payload.total }
    }
  }

  const completeHandler = (_evt: unknown, payload: { imageId: string; filename: string }): void => {
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
      fromSocket: true,
      fishId: selectedId.value
    })
    const items = Array.isArray(res?.items) ? res.items : []
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

// 监听 selectedId 变化，刷新报警
watch(selectedId, () => {
  fetchAlertsAndUpdate()
})

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

function goAlerts(): void {
  // 跳转到报警页面（按路由名称）
  router.push({ name: 'alerts' })
}

// 路径折线与当前位置标注引用，便于更新与移除
let pollTimer: number | null = null
let alertPollTimer: number | null = null
// 持续按压动作的定时器集合（键：动作名；值：setInterval 返回的标识）
const holdTimers: Record<string, number> = {}

// 视频弹窗状态
type VideoMode = 'microwaveMono' | 'microwaveStereo' | 'starlinkMono' | 'starlinkStereo'
const videoDialogVisible = ref(false)
const videoMode = ref<VideoMode>('microwaveMono')
const videoLoading = ref(false)
const videoUrl = ref('')

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
      if (result.wsPort) {
        videoUrl.value = `ws://localhost:${result.wsPort}/`
      }
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

    const BMap = getBMap()
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

      // 渲染初始 Marker
      renderMarkers()

      // 轮询最新数据
      pollTimer = window.setInterval((): void => {
        void refreshAll()
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
</script>

<template>
  <section class="screen">
    <div class="layout">
      <div class="map-panel">
        <div id="bmap-container" class="bmap"></div>

        <!-- 头部下拉选择（已移除，改由 TopBar 控制） -->
        <!-- <div class="map-header-control"> ... </div> -->

        <!-- 实时视频按钮 -->
        <div class="map-video-btn" v-if="selectedId">
          <el-button type="primary" size="large" circle @click="openVideo('microwaveMono')">
            <el-icon><VideoCamera /></el-icon>
          </el-button>
        </div>
      </div>
      <div class="side-panel">
        <div class="panel-card">
          <div class="section-header" style="display: flex; align-items: center; justify-content: space-between; gap: 12px">
            <span class="section-title">{{ currentFish?.name || t('screen.basicInfo') }}</span>
            <el-button
              type="primary"
              :disabled="!selectedId"
              @click="openVideo('microwaveMono')"
              style="
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                width: auto;
                background: linear-gradient(90deg, #00c6fb 0%, #005bea 100%);
                border: none;
                box-shadow: 0 4px 12px rgba(0, 91, 234, 0.4);
                border-radius: 6px;
                padding: 0 16px;
              "
            >
              {{ t('screen.videoDialogTitle') }}
            </el-button>
          </div>
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
            <button class="section-more" type="button" :title="t('home.alerts')" @click="goAlerts()">
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
              <span class="text">{{ t('screen.forward') }}</span>
            </button>
            <button class="action-btn primary" @click="moveLeftDebounced">
              <span class="text">{{ t('screen.left') }}</span>
            </button>
            <button class="action-btn primary" @click="moveRightDebounced">
              <span class="text">{{ t('screen.right') }}</span>
            </button>
            <!-- 垂直运动 -->
            <button class="action-btn accent" @click="controlUpDebounced">
              <span class="text">{{ t('screen.up') }}</span>
            </button>
            <button class="action-btn accent" @click="controlDownDebounced">
              <span class="text">{{ t('screen.down') }}</span>
            </button>
            <button class="action-btn accent" @click="controlDiveDebounced">
              <span class="text">{{ t('screen.dive') }}</span>
            </button>
            <!-- 模式/返航/上浮 -->
            <button class="action-btn warn" @click="enableManualDebounced">
              <span class="text">{{ t('screen.manual') }}</span>
            </button>
            <button class="action-btn info" @click="returnHomeDebounced">
              <span class="text">{{ t('screen.return') }}</span>
            </button>
            <button class="action-btn accent" @click="controlSurfDebounced">
              <span class="text">{{ t('screen.surf') }}</span>
            </button>
            <!-- 功耗与灯光 -->
            <button class="action-btn warn" @click="enableNavigateDebounced">
              <span class="text">{{ t('screen.navigate') }}</span>
            </button>
            <button class="action-btn info" @click="setLightOnDebounced">
              <span class="text">{{ t('screen.lightOn') }}</span>
            </button>
            <button class="action-btn info" @click="setLightOffDebounced">
              <span class="text">{{ t('screen.lightOff') }}</span>
            </button>
            <button class="action-btn info" @click="openInitialTargetDialog">
              <span class="text">{{ t('screen.initialTarget') }}</span>
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
        <div :class="['video-container', { 'video-loading': videoLoading }]"
        v-loading="videoLoading"
        :element-loading-text="t('screen.switchVideo')"
        element-loading-background="rgba(0, 0, 0, 0.8)">
        <template v-if="showVideoPlayer">
          <VideoPlayerJSMpeg :url="videoUrl" />
        </template>
        <template v-else>
          <div class="video-placeholder">
            {{ t('screen.videoPlaceholder', { title: currentVideoTitle }) }}
          </div>
        </template>
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
              <el-input-number v-model="navigateTrack[$index].lon" :min="-180" :max="180" :step="0.000001" :precision="6"
                controls-position="right" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column :label="t('history.lat')">
            <template #default="{ $index }">
              <el-input-number v-model="navigateTrack[$index].lat" :min="-90" :max="90" :step="0.000001" :precision="6"
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
    <el-dialog v-model="initialTargetDialogVisible" :title="t('screen.setInitialTarget')" width="400px">
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 10px">
        <div>
          <label style="display: block; margin-bottom: 8px">{{ t('history.lon') }}</label>
          <el-input-number v-model="initialTargetLon" :precision="7" :step="0.0000001" style="width: 100%"
            controls-position="right" />
        </div>
        <div>
          <label style="display: block; margin-bottom: 8px">{{ t('history.lat') }}</label>
          <el-input-number v-model="initialTargetLat" :precision="7" :step="0.0000001" style="width: 100%"
            controls-position="right" />
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="initialTargetDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="confirmInitialTarget">{{
            t('common.confirm')
          }}</el-button>
        </span>
      </template>
    </el-dialog>
  </section>
</template>

<style lang="scss" scoped src="./index.scss"></style>
