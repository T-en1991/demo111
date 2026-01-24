import { defineStore } from 'pinia'
import { ref } from 'vue'
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

export const useFishControlStore = defineStore(
  'fishControl',
  () => {
    const currentFish = ref<Fish | null>(null)
    const currentStatus = ref<FishTelemetry | null>(null)
    const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>(
      'disconnected'
    )
    const logs = ref<string[]>([])
    const lastSurfAt = ref<string | null>(null)

    let cleanupListeners: (() => void)[] = []

    function setCurrentFish(fish: Fish): void {
      // If switching fish, disconnect previous?
      // For now, just update the reference.
      // Realistically we might want to maintain connections to multiple fish,
      // but the UI seems to focus on one "Screen" view.
      currentFish.value = fish
      currentStatus.value = null // Reset status when switching fish
      connectionStatus.value = 'disconnected' // Reset status display, though actual socket might be open.
      // We should probably check if there is an active connection for this fish?
      // The main process knows. But we don't have a "checkStatus" API yet.
      // We can assume disconnected or try to connect.
    }

    async function disconnect(): Promise<void> {
      if (!currentFish.value) return
      const { satcomIp, satcomPort1 } = currentFish.value

      if (satcomIp) {
        if (satcomPort1) {
          await (window.api as any).tcp.disconnect(satcomIp, satcomPort1)
        }
      }
      connectionStatus.value = 'disconnected'
    }

    function clearLogs(): void {
      logs.value = []
    }

    async function connect(): Promise<void> {
      if (!currentFish.value?.satcomIp || !currentFish.value?.satcomPort1) {
        ElMessage.warning(t('store.fishControl.noIpPort'))
        return
      }

      if (connectionStatus.value === 'connected') return

      connectionStatus.value = 'connecting'
      const { satcomIp, satcomPort1 } = currentFish.value

      let connected1 = false

      // Connect Port 1
      if (satcomPort1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await window.api.tcp.connect(satcomIp, satcomPort1)
        if (res) connected1 = true
      }

      if (!connected1) {
        connectionStatus.value = 'error'
        ElMessage.error(t('store.fishControl.connectFail'))
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
      console.log('currentFish', currentFish.value)
      if (!currentFish.value) {
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
          // Ascend/Descend seem duplicates of Up/Down in this context or specific?
          // Based on index.vue, they map to specific fields.
          // If the backend handles 'UP'/'DOWN', we use those.
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
          await connect()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((connectionStatus.value as any) !== 'connected') return
        }
      }

      try {
        const res = await window.api.fish.sendCommand(
          currentFish.value.id,
          protocol,
          command,
          params
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = res as any // The result from sendCommand is { success: boolean, command?: string, error?: string } but maybe not fully typed in window.api yet if we didn't update types well enough or if invoke returns any

        if (result.success) {
          logs.value.push(`[${new Date().toLocaleTimeString()}] SEND(${protocol}): ${command}`)
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

    // TrackPoint definition moved to top-level export

    async function enterNavigationMode(): Promise<boolean> {
      if (!currentFish.value) return false

      // 1. Send Navigate Command
      ElMessage.info(t('store.fishControl.sendingNav'))

      await sendCommand('navigate')

      // 2. Wait for NAVIGATE-SUCCESS
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

      // 3. Send Trajectory Points
      try {
        ElMessage.info(t('store.fishControl.startTrack'))
        // Group points by 2
        const packets: TrackPoint[][] = []
        for (let i = 0; i < track.length; i += 2) {
          if (i + 1 < track.length) {
            packets.push([track[i], track[i + 1]])
          } else {
            // Last single point, duplicate it
            packets.push([track[i], track[i]])
          }
        }

        for (let i = 0; i < packets.length; i++) {
          const isLast = i === packets.length - 1
          const seq = isLast ? 'PE' : `P${i + 1}`
          const points = packets[i]

          // Format payload: seq,lat1,lon1,D1,A1|lat2,lon2,D2,A2
          // lat/lon * 10000, depth/alt * 100
          const fmt = (p: TrackPoint): string => {
            const lat = Math.round(p.lat * 10000)
            const lon = Math.round(p.lon * 10000)
            const depth = p.depth !== null ? Math.round(p.depth * 100) : 0
            const alt = p.alt !== null ? Math.round(p.alt * 100) : 0
            // Use 0 for whichever is not set (XOR logic handled in UI, here we trust input)
            return `${lat},${lon},${depth},${alt}`
          }

          const payloadData = `${fmt(points[0])}|${fmt(points[1])}`

          // Send via IPC
          // We use 'acoustic' protocol.
          try {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const res = await (window.api as any).fish.sendCommand(
                currentFish.value.id,
                'acoustic',
                seq,
                [payloadData]
             )

             if (!res.success) {
                 throw new Error(res.error || 'Send failed')
             }

             logs.value.push(`[${new Date().toLocaleTimeString()}] SEND: ${seq} ${payloadData}`)
             console.log('Sending trajectory packet:', seq, payloadData)

             // Wait for CMD-OK,seq
             const expect = `CMD-OK,${seq}`
             await waitFor((data) => data.includes(expect), 5000)

          } catch (e) {
              throw e
          }
        }

        ElMessage.success(t('store.fishControl.trackSuccess'))
      } catch (e) {
        console.error(e)
        ElMessage.error(t('store.fishControl.trackFail', { msg: e instanceof Error ? e.message : 'Unknown error' }))
      }
    }

    function initListeners(): void {
      // Clear previous listeners
      cleanupListeners.forEach((fn) => fn())
      cleanupListeners = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onStatus = (window.api as any).tcp.onStatus(({ ip, port, status }) => {
        if (!currentFish.value?.satcomIp) return

        if (currentFish.value.satcomIp === ip) {
          if (currentFish.value.satcomPort1 === port) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            connectionStatus.value = status as any
          }
          // We could handle port2 status logging if needed
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onData = (window.api as any).tcp.onData(({ ip, port, data }) => {
        const fish = currentFish.value
        if (fish && fish.satcomIp === ip && fish.satcomPort1 === port) {
          // Trigger temporary listeners
          for (let i = listeners.value.length - 1; i >= 0; i--) {
            const handler = listeners.value[i]
            if (handler(data)) {
              // If handler returns true, it's done and removed by the handler wrapper in waitFor
              // but we splice it there based on reference.
              // Actually the splice logic in waitFor might race if we iterate here.
              // Better to let the wrapper handle removal from array reference.
              // But here we need to know if we should continue?
              // Usually one data packet might satisfy multiple waiters? Probably not.
              // Let's assume one match is enough.
            }
          }

          const now = new Date()
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`
          console.log(`[${timeStr}] 监听到的内容:`, data)

          // 使用新的解析器处理数据
          realtimeDataParser.process(data, {
            fish,
            ip,
            port,
            updateStatus: (status: FishTelemetry) => {
              // 合并现有状态（保留之前的 statusText 等）
              currentStatus.value = {
                ...currentStatus.value,
                ...status
              } as FishTelemetry
            }
          })

          // 匹配 TCP 状态关键字
          const dataStr = data.toString()
          for (const config of FISH_STATUS_CONFIG) {
            if (dataStr.includes(config.keyword)) {
              console.log(`[TCP] 匹配到状态: ${config.label}`)
              // 更新状态文本
              if (!currentStatus.value) {
                currentStatus.value = {
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
              }
              currentStatus.value.statusText = config.label
              currentStatus.value.runStatus = config.status
              currentStatus.value.lastUpdated = Date.now()
              break
            }
          }

          logs.value.push(`[${new Date().toLocaleTimeString()}] RECV: ${data}`)
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const onError = (window.api as any).tcp.onError(({ ip, port, error }) => {
        if (currentFish.value?.satcomIp === ip) {
          if (currentFish.value?.satcomPort1 === port) {
            connectionStatus.value = 'error'
            logs.value.push(`[${new Date().toLocaleTimeString()}] ERROR: ${error}`)
            ElMessage.error(t('store.fishControl.connectError', { error }))
          }
        }
      })

      cleanupListeners.push(onStatus, onData, onError)

      // 监听串口 SURF 上浮事件，更新状态与记录
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ipc = (window as any).electron?.ipcRenderer
      if (ipc && typeof ipc.on === 'function') {
        const handler = (
          _evt: any,
          payload: { time: string; csq: number; raw: string; port: string }
        ) => {
          lastSurfAt.value = payload.time.replace('_', ' ')
          logs.value.push(
            `[${new Date().toLocaleTimeString()}] SURF: time=${payload.time} CSQ=${payload.csq} (${payload.port})`
          )
          ElMessage.success(t('store.fishControl.surfSuccess', { time: payload.time, csq: payload.csq }))
        }
        ipc.on('serial:surf', handler)
        cleanupListeners.push(() => {
          ipc.removeListener('serial:surf', handler)
        })
      }
      // 如果未检测到 ipcRenderer，可忽略监听，避免报错
    }

    async function sendInitialTarget(lon: string, lat: string): Promise<void> {
      if (!currentFish.value) {
        ElMessage.warning(t('store.fishControl.noFish'))
        return
      }
      if (connectionStatus.value !== 'connected') {
        await connect()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((connectionStatus.value as any) !== 'connected') return
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (window.api as any).fish.sendCommand(
            currentFish.value.id,
            'acoustic',
            'POS',
            [lon, lat]
        )

        if (res.success) {
            logs.value.push(`[${new Date().toLocaleTimeString()}] SEND: POS ${lon},${lat}`)
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
      currentFish,
      currentStatus,
      connectionStatus,
      logs,
      lastSurfAt,
      setCurrentFish,
      connect,
      disconnect,
      sendCommand,
      enterNavigationMode,
      sendTrajectory,
      initListeners,
      clearLogs,
      sendInitialTarget
    }
  },
  {
    persist: {
      key: 'fish-control',
      pick: ['currentFish'],
      storage: localStorage
    }
  }
)
