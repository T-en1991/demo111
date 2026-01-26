import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { realtimeDataParser, type FishTelemetry } from '../utils/realtimeDataParser'
import { FISH_STATUS_CONFIG } from '../config'
import i18n from '../locales'

const t = (key: string, args?: any) => i18n.global.t(key, args)

export interface Fish {
  id: number
  acousticId: string
  fishCode?: string
  name: string
  initialLon?: number | null
  initialLat?: number | null
  satcomIp?: string | null
  satcomPort1?: number | null
  satcomPort2?: number | null
  serialPortPath?: string | null
  serialBaudRate?: number | null
  starlinkRtspMono?: string | null
  starlinkRtspStereo?: string | null

  ascendCommand?: string | null
  descendCommand?: string | null
  forwardCommand?: string | null
  leftCommand?: string | null
  rightCommand?: string | null
  upCommand?: string | null
  downCommand?: string | null
  surfCommand?: string | null
  manualCommand?: string | null
  returnCommand?: string | null
  navigateCommand?: string | null
  lightOnCommand?: string | null
  lightOffCommand?: string | null
  wifiCommand?: string | null
  wifiOffCommand?: string | null
  acousticLon?: number | null
  acousticLat?: number | null
}

export interface TrackPoint {
  lon: number
  lat: number
  alt: number | null
  depth: number | null
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export const useFishControlStore = defineStore(
  'fishControl',
  () => {
    // --- State ---
    const activeFishId = ref<number | null>(null)
    const fishMap = ref<Map<number, Fish>>(new Map()) // Cache of fish configs
    const fishStates = ref<Map<number, FishTelemetry>>(new Map())
    const connectionStates = ref<Map<number, ConnectionStatus>>(new Map())
    const fishLogs = ref<Map<number, string[]>>(new Map())
    const lastSurfAt = ref<string | null>(null)

    // --- Getters (Backward Compatibility) ---
    const currentFish = computed({
      get: () => {
        if (!activeFishId.value) return null

        // Pinia persistence deserializes Map as plain object/array if not handled.
        // We need to check if fishMap.value is a real Map.
        if (fishMap.value instanceof Map) {
            return fishMap.value.get(activeFishId.value) || null
        } else {
            // Fallback for SSR/Hydration mismatch where it might be an object
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapAny = fishMap.value as any
            // If it's an array of tuples (Map JSON format), or object
            if (Array.isArray(mapAny)) {
                const found = mapAny.find(pair => pair[0] === activeFishId.value)
                return found ? found[1] : null
            } else if (typeof mapAny === 'object') {
                return mapAny[activeFishId.value] || null
            }
        }
        return null
      },
      set: (fish: Fish | null) => {
        if (fish) {
          setCurrentFish(fish)
        } else {
          activeFishId.value = null
        }
      }
    })

    const currentStatus = computed({
      get: () => (activeFishId.value ? fishStates.value.get(activeFishId.value) || null : null),
      set: (status: FishTelemetry | null) => {
        if (activeFishId.value && status) {
          fishStates.value.set(activeFishId.value, status)
        }
      }
    })

    const connectionStatus = computed({
      get: () =>
        activeFishId.value
          ? connectionStates.value.get(activeFishId.value) || 'disconnected'
          : 'disconnected',
      set: (status: ConnectionStatus) => {
        if (activeFishId.value) {
          connectionStates.value.set(activeFishId.value, status)
        }
      }
    })

    const logs = computed({
      get: () => (activeFishId.value ? fishLogs.value.get(activeFishId.value) || [] : []),
      set: (newLogs: string[]) => {
        if (activeFishId.value) {
          fishLogs.value.set(activeFishId.value, newLogs)
        }
      }
    })

    let cleanupListeners: (() => void)[] = []
    let reconnectTimers = new Map<number, number>()

    // --- Actions ---

    function setAllFish(list: Fish[]): void {
      // Ensure fishMap is a Map
      if (!(fishMap.value instanceof Map)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = fishMap.value as any
          const map = new Map<number, Fish>()
          if (Array.isArray(raw)) {
              raw.forEach(pair => map.set(pair[0], pair[1]))
          } else if (typeof raw === 'object') {
              Object.keys(raw).forEach(key => map.set(Number(key), raw[key]))
          }
          fishMap.value = map
      }

      // Update cache
      list.forEach(fish => {
          fishMap.value.set(fish.id, fish)

          // Init state placeholders
          if (!fishStates.value.has(fish.id)) {
              if (!connectionStates.value.has(fish.id)) {
                  connectionStates.value.set(fish.id, 'disconnected')
              }
              fishLogs.value.set(fish.id, [])
          }
      })
    }

    function setCurrentFish(fish: Fish): void {
      // Ensure fishMap is a Map
      if (!(fishMap.value instanceof Map)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = fishMap.value as any
          const map = new Map<number, Fish>()
          if (Array.isArray(raw)) {
              raw.forEach(pair => map.set(pair[0], pair[1]))
          } else if (typeof raw === 'object') {
              Object.keys(raw).forEach(key => map.set(Number(key), raw[key]))
          }
          fishMap.value = map
      }

      // Update cache
      fishMap.value.set(fish.id, fish)
      activeFishId.value = fish.id

      // Initialize state if not exists
      if (!fishStates.value.has(fish.id)) {
        // connectionStates.value.set(fish.id, 'disconnected') // Don't reset if already exists
        if (!connectionStates.value.has(fish.id)) {
          connectionStates.value.set(fish.id, 'disconnected')
        }
        fishLogs.value.set(fish.id, [])
      }

      // Auto-connect if new fish and not connected
      // But we don't want to auto-connect every time we click?
      // Maybe only if we explicitly want to?
      // For now, keep the previous behavior: switch -> auto connect if configured
      if (fish.satcomIp && fish.satcomPort1) {
        const status = connectionStates.value.get(fish.id)
        if (status !== 'connected' && status !== 'connecting') {
          console.log('[Store] Auto-connecting to fish:', fish.name)
          void connect(fish.id)
        }
      }
    }

    function getConnectionStatus(fishId: number): ConnectionStatus {
      return connectionStates.value.get(fishId) || 'disconnected'
    }

    function addLog(fishId: number, message: string): void {
      const logs = fishLogs.value.get(fishId) || []
      logs.push(message)
      if (logs.length > 1000) logs.shift() // Limit logs
      fishLogs.value.set(fishId, logs)
    }

    function clearLogs(): void {
      if (activeFishId.value) {
        fishLogs.value.set(activeFishId.value, [])
      }
    }

    async function disconnect(fishId?: number): Promise<void> {
      const targetId = fishId || activeFishId.value
      if (!targetId) return

      stopReconnect(targetId)

      const fish = fishMap.value.get(targetId)
      if (!fish) return

      const { satcomIp, satcomPort1 } = fish
      if (satcomIp && satcomPort1) {
        await (window.api as any).tcp.disconnect(satcomIp, satcomPort1)
      }
      connectionStates.value.set(targetId, 'disconnected')
    }

    // Auto Reconnect Logic
    function startReconnect(fishId: number): void {
      if (reconnectTimers.has(fishId)) return

      console.log(`[Store] Starting auto-reconnect for fish ${fishId}...`)

      // Define the reconnect task
      const reconnectTask = async () => {
        const status = connectionStates.value.get(fishId)
        if (status === 'connected') {
          stopReconnect(fishId)
          return
        }
        // Check if fish config still exists
        if (!fishMap.value.has(fishId)) {
          stopReconnect(fishId)
          return
        }

        console.log(`[Store] Auto-reconnecting fish ${fishId}...`)
        await connect(fishId)
      }

      // Start interval
      const timer = window.setInterval(reconnectTask, 5000)
      reconnectTimers.set(fishId, timer)

      // Trigger immediately for better UI feedback
      // We use void to not await it here, preventing blocking
      void reconnectTask()
    }

    function stopReconnect(fishId: number): void {
      const timer = reconnectTimers.get(fishId)
      if (timer) {
        clearInterval(timer)
        reconnectTimers.delete(fishId)
        console.log(`[Store] Auto-reconnect stopped for fish ${fishId}`)
      }
    }

    async function connect(fishId?: number): Promise<void> {
      // Ensure global listeners are active
      initListeners()

      const targetId = fishId || activeFishId.value
      if (!targetId) return

      const fish = fishMap.value.get(targetId)
      if (!fish) return

      if (!fish.satcomIp || !fish.satcomPort1) {
        if (targetId === activeFishId.value) {
          ElMessage.warning(t('store.fishControl.noIpPort'))
        }
        return
      }

      if (connectionStates.value.get(targetId) === 'connected') return

      connectionStates.value.set(targetId, 'connecting')
      const { satcomIp, satcomPort1 } = fish

      let connected = false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (window.api as any).tcp.connect(satcomIp, satcomPort1)
      if (res) connected = true

      if (!connected) {
        connectionStates.value.set(targetId, 'error')
        // 静默处理连接失败，因为后续会触发自动重连，避免弹出大量错误框
        // 只有当手动连接且失败时才提示？但这里无法区分手动还是自动调用
        // 或者我们可以只在 logs 中记录

        // ElMessage.error(t('store.fishControl.connectFail'))
        addLog(targetId, `[${new Date().toLocaleTimeString()}] Connection failed`)

        // Trigger auto-reconnect
        startReconnect(targetId)
      } else {
        // We set it to connected here, but initListeners also handles it via 'status' event
        // connectionStates.value.set(targetId, 'connected')
      }
    }

    async function sendCommand(
      cmdType:
        | 'forward'
        | 'left'
        | 'right'
        | 'up'
        | 'down'
        | 'surf'
        | 'manual'
        | 'return'
        | 'navigate'
        | 'lightOn'
        | 'lightOff'
        | 'ascend'
        | 'descend'
        | 'wifi'
        | 'wifiOff'
        | 'dive'
    ): Promise<void> {
      const fish = currentFish.value
      if (!fish) {
        ElMessage.warning(t('store.fishControl.noFish'))
        return
      }

      // Map cmdType to Protocol Command
      let protocol: 'acoustic' | 'iridium' = 'acoustic'
      let command = ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: any[] = []

      if (cmdType === 'dive') {
        protocol = 'iridium'
        command = 'DONE'
      } else {
        protocol = 'acoustic'
        // Map to AcousticCommandType
        switch (cmdType) {
          case 'forward':
            command = 'FORWARD'
            break
          case 'left':
            command = 'LEFT'
            break
          case 'right':
            command = 'RIGHT'
            break
          case 'up':
            command = 'UP'
            break
          case 'down':
            command = 'DOWN'
            break
          case 'surf':
            command = 'SURF'
            break
          case 'manual':
            command = 'MAN'
            break
          case 'return':
            command = 'RETURN'
            break
          case 'navigate':
            command = 'NAVIGATE'
            break
          case 'lightOn':
            command = 'LIGHTON'
            break
          case 'lightOff':
            command = 'LIGHTOFF'
            break
          case 'ascend':
            command = 'UP'
            break
          case 'descend':
            command = 'DOWN'
            break
          case 'wifi':
            command = 'WIFI'
            break
          case 'wifiOff':
            command = 'WIFIOFF'
            break
          default:
            ElMessage.warning(`Unknown command type: ${cmdType}`)
            return
        }
      }

      // Ensure connection if acoustic
      if (protocol === 'acoustic') {
        if (connectionStatus.value !== 'connected') {
          await connect(fish.id)
          if (connectionStatus.value !== 'connected') return
        }
      }

      try {
        const res = await window.api.fish.sendCommand(fish.id, protocol, command, params)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = res as any

        if (result.success) {
          addLog(fish.id, `[${new Date().toLocaleTimeString()}] SEND(${protocol}): ${command}`)
          ElMessage.success(t('store.fishControl.sendSuccess'))
        } else {
          console.error('Send failed:', result.error)
          ElMessage.error(
            t('store.fishControl.sendFail') + (result.error ? `: ${result.error}` : '')
          )
        }
      } catch (e) {
        console.error(e)
        ElMessage.error(t('store.fishControl.sendFail'))
      }
    }

    // Helper to find fish by IP/Port OR Acoustic ID
    function findFishBySource(ip: string, port: number, rawData?: string): Fish | undefined {
      // 1. Try to extract ID from raw data
      if (rawData) {
        const atMatch = rawData.match(/\+\+\+AT:(\d+):RECVIM,\s*(\d+),(\d+),(\d+),ack,(.*)/i)
        if (atMatch) {
            const srcId = atMatch[3] // This should be the Fish ID
            for (const fish of fishMap.value.values()) {
                if (String(fish.acousticId) === String(srcId) ||
                    String(fish.acousticId) === String(Number(srcId))) {
                    return fish
                }
            }
        }

        const statMatch = rawData.match(/^STAT,ID=(\w+),/i)
        if (statMatch) {
            const id = statMatch[1]
            for (const fish of fishMap.value.values()) {
                if (String(fish.acousticId) === String(id) ||
                    String(fish.acousticId) === String(Number(id))) {
                    return fish
                }
            }
        }
      }

      // 2. Fallback to IP/Port
      // Note: If multiple fish share the same IP/Port, this returns the first one found.
      // This is acceptable for status updates that don't have ID,
      // but ideally all data should have ID if multiplexing is used.
      for (const fish of fishMap.value.values()) {
        if (fish.satcomIp === ip && fish.satcomPort1 === port) {
          return fish
        }
      }
      return undefined
    }

    const listeners = ref<((data: string) => boolean)[]>([])

    // Helper to wait for specific data
    function waitFor(predicate: (data: string) => boolean, timeout = 10000): Promise<void> {
      return new Promise((resolve, reject) => {
        let timer: number | null = null
        const listener = (data: string): boolean => {
          if (predicate(data)) {
            if (timer) clearTimeout(timer)
            resolve()
            return true // Remove listener
          }
          return false
        }
        listeners.value.push(listener)
        timer = window.setTimeout(() => {
          const idx = listeners.value.indexOf(listener)
          if (idx !== -1) listeners.value.splice(idx, 1)
          reject(new Error('Timeout waiting for response'))
        }, timeout)
      })
    }

    async function enterNavigationMode(): Promise<boolean> {
      if (!currentFish.value) return false
      ElMessage.info(t('store.fishControl.sendingNav'))
      await sendCommand('navigate')
      try {
        ElMessage.info(t('store.fishControl.waitingNav'))
        await waitFor((data) => data.includes('NAVIGATE-SUCCESS'), 10000)
        ElMessage.success(t('store.fishControl.navSuccess'))
        return true
      } catch (e) {
        ElMessage.error(t('store.fishControl.navFail'))
        return false
      }
    }

    async function sendTrajectory(track: TrackPoint[]): Promise<void> {
      if (!currentFish.value) return
      const fish = currentFish.value

      try {
        ElMessage.info(t('store.fishControl.startTrack'))
        const packets: TrackPoint[][] = []
        for (let i = 0; i < track.length; i += 2) {
          if (i + 1 < track.length) {
            packets.push([track[i], track[i + 1]])
          } else {
            packets.push([track[i], track[i]])
          }
        }

        for (let i = 0; i < packets.length; i++) {
          const isLast = i === packets.length - 1
          const seq = isLast ? 'PE' : `P${i + 1}`
          const points = packets[i]

          const fmt = (p: TrackPoint): string => {
            const lat = Math.round(p.lat * 1000000)
            const lon = Math.round(p.lon * 1000000)
            const depth = p.depth !== null ? Math.round(p.depth * 100) : 0
            const alt = p.alt !== null ? Math.round(p.alt * 100) : 0
            // 纬度在前，经度在后
            return `${lat},${lon},${depth},${alt}`
          }

          // Format: Pn,lat1,lon1,d,a|lat2,lon2,d,a
          // But wait, the user example is: P1,31251134,121489134,2510,0|31252134,121486134,2510,0
          // The prefix P1 is sent as the 'command' argument to sendCommand, which puts it in the payload?
          // Let's check sendCommand implementation in tcp.ts / CommandGenerator.
          // If we pass 'seq' as command, it becomes: ...ack,P1,payloadData
          // But user wants: P1,point1|point2
          // So payloadData should be just "point1|point2" if sendCommand prepends seq?
          // Wait, look at previous code:
          // sendCommand(id, 'acoustic', seq, [payloadData])
          // -> CommandGenerator.buildAcoustic(targetId, seq, [payloadData])
          // -> ...ack,seq,payloadData
          // So if seq='P1', payload="p1|p2", result is ...ack,P1,p1|p2
          // This matches user requirement: "P1,312511,1214891,2510,0|..."

          const payloadData = `${fmt(points[0])}|${fmt(points[1])}`

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await (window.api as any).fish.sendCommand(
              fish.id,
              'acoustic',
              seq,
              [payloadData]
            )

            if (!res.success) {
              throw new Error(res.error || 'Send failed')
            }

            addLog(fish.id, `[${new Date().toLocaleTimeString()}] SEND: ${seq} ${payloadData}`)
            console.log('Sending trajectory packet:', seq, payloadData)

            // Expect: CMD-OK, P1 (allow spaces)
            await waitFor((data) => {
                const s = data.toString()
                return s.includes('CMD-OK') && s.includes(seq)
            }, 15000)
          } catch (e) {
            throw e
          }
        }

        ElMessage.success(t('store.fishControl.trackSuccess'))
      } catch (e) {
        console.error(e)
        ElMessage.error(
          t('store.fishControl.trackFail', {
            msg: e instanceof Error ? e.message : 'Unknown error'
          })
        )
      }
    }

    function initListeners(): void {
      // Avoid duplicate init
      if (cleanupListeners.length > 0) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onStatus = (window.api as any).tcp.onStatus(({ ip, port, status }) => {
        // TCP status update (connected/disconnected) affects ALL fish sharing this IP/Port
        for (const fish of fishMap.value.values()) {
            // Use loose comparison or string conversion to be safe
            if (String(fish.satcomIp) === String(ip) && Number(fish.satcomPort1) === Number(port)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const newStatus = status as any
                // Only update if changed to avoid redundant triggers, OR force if it's connected
                // (to ensure UI sync)
                const oldStatus = connectionStates.value.get(fish.id)

                if (oldStatus !== newStatus) {
                    connectionStates.value.set(fish.id, newStatus)
                    console.log(`[Store] Connection status updated for ${fish.name} (${fish.id}): ${oldStatus} -> ${newStatus}`)
                }

                if (newStatus === 'connected') {
                    // Ensure we stop reconnecting if we are now connected
                    stopReconnect(fish.id)
                    // Force set again to be sure (in case oldStatus === newStatus but we want to confirm)
                    if (oldStatus !== 'connected') {
                         connectionStates.value.set(fish.id, 'connected')
                    }
                } else if (newStatus === 'disconnected') {
                    // Check if this was an unexpected disconnection
                    // If the previous state was 'connected' or 'connecting', it implies we wanted to be connected.
                    // User manual disconnect sets state to 'disconnected' BEFORE calling backend disconnect?
                    // Let's check the disconnect action: it sets 'disconnected' AFTER calling backend.
                    // So if we receive 'disconnected' event, and our local state is still 'connected',
                    // it means the backend/network dropped connection unexpectedly.
                    const currentState = connectionStates.value.get(fish.id)
                    if (currentState === 'connected' || currentState === 'connecting') {
                        console.log(`[Store] Unexpected disconnection for ${fish.name}, triggering reconnect...`)
                        // Update state to reflect reality
                        connectionStates.value.set(fish.id, 'disconnected')
                        startReconnect(fish.id)
                    }
                }
            }
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onData = (window.api as any).tcp.onData(({ ip, port, data }) => {
        const fish = findFishBySource(ip, port, data)
        if (fish) {
          // Force connected state
          if (connectionStates.value.get(fish.id) !== 'connected') {
            connectionStates.value.set(fish.id, 'connected')
            stopReconnect(fish.id)
          }

          // Global temporary listeners (for waitFor)
          // Note: waitFor logic might need to be fish-aware if we want strictness,
          // but for now we assume command responses come to the active fish or we just check content.
          for (let i = listeners.value.length - 1; i >= 0; i--) {
            const handler = listeners.value[i]
            if (handler(data)) {
              // handler returned true, remove it?
              // Logic handled in waitFor
            }
          }

          const now = new Date()
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`
          console.log(`[${timeStr}] Data from ${fish.name}:`, data)

          realtimeDataParser.process(data, {
            fish,
            ip,
            port,
            updateStatus: (status: FishTelemetry) => {
              const prev = fishStates.value.get(fish.id) || {}
              fishStates.value.set(fish.id, {
                ...prev,
                ...status
              } as FishTelemetry)
            }
          })

          // Status Keywords
          const dataStr = data.toString()
          for (const config of FISH_STATUS_CONFIG) {
            if (dataStr.includes(config.keyword)) {
              const current = fishStates.value.get(fish.id) || {
                yaw: 0,
                pitch: 0,
                roll: 0,
                depth: 0,
                altitude: 0,
                battery: 0,
                acoustic: 'weak',
                lng: 0,
                lat: 0,
                lastUpdated: Date.now()
              }
              current.statusText = config.label
              current.runStatus = config.status
              current.lastUpdated = Date.now()
              fishStates.value.set(fish.id, current)
              break
            }
          }

          addLog(fish.id, `[${new Date().toLocaleTimeString()}] RECV: ${data}`)
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onError = (window.api as any).tcp.onError(({ ip, port, error }) => {
        // TCP Error affects ALL fish sharing this IP/Port
        for (const fish of fishMap.value.values()) {
            if (fish.satcomIp === ip && fish.satcomPort1 === port) {
                connectionStates.value.set(fish.id, 'error')

                // 仅记录日志，不再弹窗提示，避免重连过程中刷屏
                addLog(fish.id, `[${new Date().toLocaleTimeString()}] Connection error: ${error}`)

                /*
                if (fish.id === activeFishId.value) {
                   ElMessage.error(t('store.fishControl.connectError', { error }))
                }
                */

                startReconnect(fish.id)
            }
        }
      })

      cleanupListeners.push(onStatus, onData, onError)

      // Serial listeners (global for now, but should ideally be mapped to fish via serial port path)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ipc = (window as any).electron?.ipcRenderer
      if (ipc && typeof ipc.on === 'function') {
        const handler = (
          _evt: any,
          payload: { time: string; csq: number; raw: string; port: string }
        ) => {
          lastSurfAt.value = payload.time.replace('_', ' ')
          // Log to active fish? Or all?
          // Since serial is global/ambiguous without port mapping, maybe just active?
          if (activeFishId.value) {
             addLog(activeFishId.value, `[${new Date().toLocaleTimeString()}] SURF: time=${payload.time} CSQ=${payload.csq} (${payload.port})`)
             ElMessage.success(t('store.fishControl.surfSuccess', { time: payload.time, csq: payload.csq }))
          }
        }
        ipc.on('serial:surf', handler)

        // Listen for TCP alert toasts (NAV_SUCCESS, MANUAL-SUCCESS, etc.)
        const toastHandler = (_evt: any, payload: { title: string; message: string; type: 'success' | 'warning' | 'error' }) => {
            ElMessage({
                message: payload.title, // Display title as main message
                type: payload.type || 'success',
                duration: 3000,
                showClose: true
            })
            // Optionally log to current fish console if we can determine ID,
            // but backend already logs to DB/SystemLog, so maybe redundant here unless we parse ID from message.
        }
        ipc.on('tcp:alert-toast', toastHandler)

        cleanupListeners.push(() => {
          ipc.removeListener('serial:surf', handler)
          ipc.removeListener('tcp:alert-toast', toastHandler)
        })
      }
    }

    async function sendInitialTarget(lon: string, lat: string): Promise<void> {
      if (!currentFish.value) {
        ElMessage.warning(t('store.fishControl.noFish'))
        return
      }
      const fishId = currentFish.value.id

      if (connectionStatus.value !== 'connected') {
        await connect(fishId)
        if (connectionStatus.value !== 'connected') return
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (window.api as any).fish.sendCommand(
            fishId,
            'acoustic',
            'POS',
            [lon, lat]
        )

        if (res.success) {
            addLog(fishId, `[${new Date().toLocaleTimeString()}] SEND: POS ${lon},${lat}`)
            ElMessage.success(t('screen.initialTargetSent'))
        } else {
            ElMessage.error(t('store.fishControl.sendFail'))
        }
      } catch (e) {
          console.error(e)
          ElMessage.error(t('store.fishControl.sendFail'))
      }
    }

    return {
      // State Refs (exposed for debugging/advanced usage if needed)
      activeFishId,
      fishMap,
      fishStates,
      connectionStates,
      fishLogs,

      // Getters (Computed)
      currentFish,
      currentStatus,
      connectionStatus,
      logs,
      lastSurfAt,

      // Actions
      setAllFish,
      setCurrentFish,
      connect,
      disconnect,
      sendCommand,
      enterNavigationMode,
      sendTrajectory,
      initListeners,
      clearLogs,
      sendInitialTarget,
      getConnectionStatus
    }
  },
  {
    persist: {
      key: 'fish-control',
      pick: ['activeFishId', 'fishMap'], // Persist active ID and cache
      storage: localStorage,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      afterRestore: (ctx: any) => {
        // Convert plain object back to Map if needed
        if (ctx.store.fishMap && !(ctx.store.fishMap instanceof Map)) {
            // pinia-plugin-persistedstate usually restores as object for Maps if not configured with custom serializer
            // Let's assume it restored as an Object { "1": {...}, "2": {...} }
            const raw = ctx.store.fishMap
            const map = new Map<number, Fish>()
            Object.keys(raw).forEach(key => {
                map.set(Number(key), raw[key])
            })
            ctx.store.fishMap = map
        }
      }
    }
  }
)
