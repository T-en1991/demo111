import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { realtimeDataParser, type FishTelemetry } from '../utils/realtimeDataParser'

export interface Fish {
  id: number
  name: string
  satcomIp?: string | null
  satcomPort1?: number | null
  satcomPort2?: number | null
  microwaveIp?: string | null
  microwavePort?: number | null

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
  acousticLon?: number | null
  acousticLat?: number | null
}

export interface TrackPoint {
  lon: number
  lat: number
  alt: number | null
  depth: number | null
}

export const useFishControlStore = defineStore('fishControl', () => {
  const currentFish = ref<Fish | null>(null)
  const currentStatus = ref<FishTelemetry | null>(null)
  const connectionStatus = ref<string>('disconnected')
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
      ElMessage.warning('当前机器鱼未配置声通IP或端口')
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
      ElMessage.error('连接失败')
    }
  }

  async function sendCommand(cmdType: 'forward' | 'left' | 'right' | 'up' | 'down' | 'surf' | 'manual' | 'return' | 'navigate' | 'lightOn' | 'lightOff' | 'ascend' | 'descend' | 'wifi'): Promise<void> {
    console.log('currentFish', currentFish.value)
    if (!currentFish.value) {
      ElMessage.warning('未选择机器鱼')
      return
    }
    // Special-case: 'down' uses COM port to send 'done' command
    if (cmdType === 'down') {
      const comPath = currentFish.value.microwaveIp || ''
      const baudRate = currentFish.value.microwavePort || 9600
      if (!comPath) {
        ElMessage.warning('未配置串口（microwaveIp），无法下潜')
        return
      }
      try {
        // Try opening the serial port; if already open, main will handle gracefully
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (window.api as any).serial.open({ path: comPath, baudRate })
      } catch (e) {
        // Ignore open errors here; write will report if not open
        console.warn('串口打开失败或已打开:', e)
      }
      // Send literal 'done' (main will append CRLF if missing)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = await (window.api as any).serial.write('done')
      if (ok) {
        logs.value.push(`[${new Date().toLocaleTimeString()}] COM SEND(${comPath}): done`)
        ElMessage.success('已通过串口发送下潜指令')
      } else {
        ElMessage.error('串口发送失败：请检查串口是否占用或未打开')
      }
      return
    }

    // Other commands: ensure TCP connection and send via satcom
    // Allow sending if status is connected OR if it's a known active status (not disconnected/error)
    const badStates = ['disconnected', 'error', 'connecting']
    if (badStates.includes(connectionStatus.value)) {
      await connect()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (badStates.includes(connectionStatus.value)) return
    }

    let payload: string | null | undefined = ''
    switch (cmdType) {
      case 'forward': payload = currentFish.value.forwardCommand; break;
      case 'left': payload = currentFish.value.leftCommand; break;
      case 'right': payload = currentFish.value.rightCommand; break;
      case 'up': payload = currentFish.value.upCommand; break;
      case 'surf': payload = currentFish.value.surfCommand; break;
      case 'manual': payload = currentFish.value.manualCommand; break;
      case 'return': payload = currentFish.value.returnCommand; break;
      case 'navigate': payload = currentFish.value.navigateCommand; break;
      case 'lightOn': payload = currentFish.value.lightOnCommand; break;
      case 'lightOff': payload = currentFish.value.lightOffCommand; break;
      case 'ascend': payload = currentFish.value.ascendCommand; break;
      case 'descend': payload = currentFish.value.descendCommand; break;
      case 'wifi': payload = currentFish.value.wifiCommand; break;
    }
    if (!payload) {
      ElMessage.warning(`未配置 ${cmdType} 指令`)
      return
    }

    const { satcomIp, satcomPort1 } = currentFish.value
    if (!satcomIp || !satcomPort1) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const success = await (window.api as any).tcp.sendClient(satcomIp, satcomPort1, payload)
    if (success) {
      console.log('发送的控制台命令:', payload)
      logs.value.push(`[${new Date().toLocaleTimeString()}] SEND: ${payload}`)
    } else {
      ElMessage.error(`发送指令失败`)
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
    ElMessage.info('正在发送导航模式指令...')

    await sendCommand('navigate')

    // 2. Wait for NAVIGATE-SUCCESS
    try {
      ElMessage.info('等待设备确认导航模式...')
      await waitFor((data) => data.includes('NAVIGATE-SUCCESS'), 10000)
      ElMessage.success('导航模式启动成功，请配置轨迹...')
      return true
    } catch (e) {
      ElMessage.error('导航模式启动超时或失败')
      return false
    }
  }

  async function sendTrajectory(track: TrackPoint[]): Promise<void> {
    if (!currentFish.value) return

    // 3. Send Trajectory Points
    try {
      ElMessage.info('开始下发轨迹...')
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

      ElMessage.success('轨迹下发完成')

    } catch (e) {
      console.error(e)
      ElMessage.error(`轨迹下发失败: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  function initListeners(): void {
    // Clear previous listeners
    cleanupListeners.forEach(fn => fn())
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
          updateStatus: (status: Partial<FishTelemetry>) => {
            // 合并更新 currentStatus
            if (currentStatus.value) {
              currentStatus.value = { ...currentStatus.value, ...status }
            } else {
              currentStatus.value = status as FishTelemetry
            }
          }
        })

        logs.value.push(`[${new Date().toLocaleTimeString()}] RECV: ${data}`)
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onError = (window.api as any).tcp.onError(({ ip, port, error }) => {
      if (currentFish.value?.satcomIp === ip) {
        if (currentFish.value?.satcomPort1 === port) {
          connectionStatus.value = 'error'
          logs.value.push(`[${new Date().toLocaleTimeString()}] ERROR: ${error}`)
          ElMessage.error(`连接错误: ${error}`)
        }
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipc = (window as any).electron?.ipcRenderer

    // Listen for serial status updates (keyword matching)
    if (ipc && typeof ipc.on === 'function') {
      const statusHandler = (_evt: any, payload: { status: string; label: string }) => {
        // Update currentStatus label for UI feedback
        if (currentStatus.value) {
          currentStatus.value = { ...currentStatus.value, label: payload.label }
        } else {
          // If no status yet, initialize with just label
          currentStatus.value = { label: payload.label } as FishTelemetry
        }
        logs.value.push(`[${new Date().toLocaleTimeString()}] STATUS: ${payload.label}`)
      }
      ipc.on('serial:status-update', statusHandler)
      cleanupListeners.push(() => {
        ipc.removeListener('serial:status-update', statusHandler)
      })
    }

    cleanupListeners.push(onStatus, onData, onError)

    // 监听串口 SURF 上浮事件，更新状态与记录
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (ipc && typeof ipc.on === 'function') {
      const handler = (_evt: any, payload: { time: string; csq: number; raw: string; port: string }) => {
        lastSurfAt.value = payload.time.replace('_', ' ')
        logs.value.push(`[${new Date().toLocaleTimeString()}] SURF: time=${payload.time} CSQ=${payload.csq} (${payload.port})`)
        ElMessage.success(`上浮成功: ${payload.time} CSQ=${payload.csq}`)
      }
      ipc.on('serial:surf', handler)
      cleanupListeners.push(() => {
        ipc.removeListener('serial:surf', handler)
      })
    }
    // 如果未检测到 ipcRenderer，可忽略监听，避免报错
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
    clearLogs
  }
},
  {
    persist: {
      key: 'fish-control',
      pick: ['currentFish'],
      storage: localStorage
    }
  })
