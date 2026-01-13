import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { realtimeDataParser, type FishTelemetry } from '../utils/realtimeDataParser'
import { FISH_STATUS_CONFIG } from '../config'
import i18n from '../locales'

const t = (key: string, args?: any) => i18n.global.t(key, args)

export interface Fish {
  id: number
  name: string
  satcomIp?: string | null
  satcomPort1?: number | null
  satcomPort2?: number | null
  microwaveIp?: string | null
  microwavePort?: number | null
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
        const res = await (window.api as any).tcp.connect(satcomIp, satcomPort1)
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
      // Special-case: 'dive' uses COM port to send 'done' command
      if (cmdType === 'dive') {
        const comPath = currentFish.value.microwaveIp || ''
        const baudRate = currentFish.value.microwavePort || 9600
        if (!comPath) {
          ElMessage.warning(t('store.fishControl.noSerial'))
          return
        }

        // 直接发送 'done'，假设后台监听已打开串口
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let ok = await (window.api as any).serial.write('done')

        // 如果发送失败，可能是串口未打开，尝试打开一次
        if (!ok) {
          console.warn('串口发送失败，尝试重新打开串口...')
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (window.api as any).serial.open({ path: comPath, baudRate })
            // 重试发送
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ok = await (window.api as any).serial.write('done')
          } catch (e) {
            console.error('重新打开串口失败:', e)
          }
        }

        if (ok) {
          logs.value.push(`[${new Date().toLocaleTimeString()}] COM SEND(${comPath}): done`)
          ElMessage.success(t('store.fishControl.serialSendSuccess'))
        } else {
          ElMessage.error(t('store.fishControl.serialSendFail'))
        }
        return
      }

      // Other commands: ensure TCP connection and send via satcom
      if (connectionStatus.value !== 'connected') {
        await connect()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((connectionStatus.value as any) !== 'connected') return
      }

      let payload: string | null | undefined = ''
      switch (cmdType) {
        case 'forward':
          payload = currentFish.value.forwardCommand
          break
        case 'left':
          payload = currentFish.value.leftCommand
          break
        case 'right':
          payload = currentFish.value.rightCommand
          break
        case 'up':
          payload = currentFish.value.upCommand
          break
        case 'down':
          payload = currentFish.value.downCommand
          break
        case 'surf':
          payload = currentFish.value.surfCommand
          break
        case 'manual':
          payload = currentFish.value.manualCommand
          break
        case 'return':
          payload = currentFish.value.returnCommand
          break
        case 'navigate':
          payload = currentFish.value.navigateCommand
          break
        case 'lightOn':
          payload = currentFish.value.lightOnCommand
          break
        case 'lightOff':
          payload = currentFish.value.lightOffCommand
          break
        case 'ascend':
          payload = currentFish.value.ascendCommand
          break
        case 'descend':
          payload = currentFish.value.descendCommand
          break
        case 'wifi':
          payload = currentFish.value.wifiCommand
          break
        case 'wifiOff':
          payload = currentFish.value.wifiOffCommand
          break
      }
      if (!payload) {
        ElMessage.warning(t('store.fishControl.noCmd', { cmd: cmdType }))
        return
      }

      const { satcomIp, satcomPort1 } = currentFish.value
      if (!satcomIp || !satcomPort1) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const success = await (window.api as any).tcp.sendClient(satcomIp, satcomPort1, payload)
      console.log(success,221)
      if (success) {
        console.log('发送的控制台命令:', payload)
        logs.value.push(`[${new Date().toLocaleTimeString()}] SEND: ${payload}`)
      } else {
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

          const payloadData = `${seq},${fmt(points[0])}|${fmt(points[1])}`

          // Construct full AT command
          // +++AT*SENDIM,<Length>,<Dest>,ack,<Payload>
          // Length is bytes of payloadData
          const len = new TextEncoder().encode(payloadData).length
          const dest = 2 // Default destination
          const cmd = `+++AT*SENDIM,${len},${dest},ack,${payloadData}`

          // Send directly via TCP
          const { satcomIp, satcomPort1 } = currentFish.value
          if (!satcomIp || !satcomPort1) throw new Error('No Satcom connection')

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const success = await (window.api as any).tcp.sendClient(satcomIp, satcomPort1, cmd)
          if (!success) throw new Error(`Failed to send packet ${seq}`)

          logs.value.push(`[${new Date().toLocaleTimeString()}] SEND: ${cmd}`)
          console.log('Sending trajectory packet:', cmd)

          // Wait for CMD-OK,seq
          // Example: CMD-OK,P1 or CMD-OK,PE
          const expect = `CMD-OK,${seq}`
          await waitFor((data) => data.includes(expect), 5000)

          // Optional: slight delay between packets?
          // await new Promise(r => setTimeout(r, 100))
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

      const id = currentFish.value.id
      const content = `POS,${lon},${lat}`
      const len = content.length
      // +++AT*SENDIM,LEN,ID,ack,POS,LONGITUDE,LATITUDE
      const payload = `+++AT*SENDIM,${len},${id},ack,${content}`

      const { satcomIp, satcomPort1 } = currentFish.value
      if (!satcomIp || !satcomPort1) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const success = await (window.api as any).tcp.sendClient(satcomIp, satcomPort1, payload)
      if (success) {
        logs.value.push(`[${new Date().toLocaleTimeString()}] SEND: ${payload}`)
        ElMessage.success(t('screen.initialTargetSent'))
      } else {
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
