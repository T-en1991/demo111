import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

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
}

export const useFishControlStore = defineStore('fishControl', () => {
  const currentFish = ref<Fish | null>(null)
  const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const logs = ref<string[]>([])

  let cleanupListeners: (() => void)[] = []

  function setCurrentFish(fish: Fish): void {
    // If switching fish, disconnect previous?
    // For now, just update the reference.
    // Realistically we might want to maintain connections to multiple fish,
    // but the UI seems to focus on one "Screen" view.
    currentFish.value = fish
    connectionStatus.value = 'disconnected' // Reset status display, though actual socket might be open.
    // We should probably check if there is an active connection for this fish?
    // The main process knows. But we don't have a "checkStatus" API yet.
    // We can assume disconnected or try to connect.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (window.api as any).tcp.connect(satcomIp, satcomPort1)
    if (!res) {
      connectionStatus.value = 'error'
      ElMessage.error('连接失败')
    }
  }

  async function disconnect(): Promise<void> {
     if (!currentFish.value?.satcomIp || !currentFish.value?.satcomPort1) return
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     await (window.api as any).tcp.disconnect(currentFish.value.satcomIp, currentFish.value.satcomPort1)
     connectionStatus.value = 'disconnected'
  }

  async function sendCommand(cmdType: 'forward' | 'left' | 'right' | 'up' | 'down' | 'surf' | 'manual' | 'return' | 'navigate' | 'lightOn' | 'lightOff' | 'ascend' | 'descend' | 'wifi'): Promise<void> {
    console.log('currentFish',currentFish.value)
    if (!currentFish.value) {
       ElMessage.warning('未选择机器鱼')
       return
     }
 console.log('connectionStatus',connectionStatus.value)
     // Auto-connect if needed
     if (connectionStatus.value !== 'connected') {
        await connect()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((connectionStatus.value as any) !== 'connected') return
     }

     let payload: string | null | undefined = ''
     switch(cmdType) {
        case 'forward': payload = currentFish.value.forwardCommand; break;
        case 'left': payload = currentFish.value.leftCommand; break;
        case 'right': payload = currentFish.value.rightCommand; break;
        case 'up': payload = currentFish.value.upCommand; break;
        case 'down': payload = currentFish.value.downCommand; break;
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
console.log('payload',payload)
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
       ElMessage.success(`发送指令成功`)
       logs.value.push(`[${new Date().toLocaleTimeString()}] SEND: ${payload}`)
     } else {
       ElMessage.error(`发送指令失败`)
     }
  }

  function initListeners(): void {
    // Clear previous listeners
    cleanupListeners.forEach(fn => fn())
    cleanupListeners = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onStatus = (window.api as any).tcp.onStatus(({ ip, port, status }) => {
        if (currentFish.value?.satcomIp === ip && currentFish.value?.satcomPort1 === port) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            connectionStatus.value = status as any
            if (status === 'connected') {
              // ElMessage.success('已连接')
            } else if (status === 'disconnected') {
              // ElMessage.warning('已断开')
            }
        }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onData = (window.api as any).tcp.onData(({ ip, port, data }) => {
         if (currentFish.value?.satcomIp === ip && currentFish.value?.satcomPort1 === port) {
            console.log('监听到的内容:', data)
            logs.value.push(`[${new Date().toLocaleTimeString()}] RECV: ${data}`)
            ElMessage.success(`收到数据: ${data}`)
         }
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onError = (window.api as any).tcp.onError(({ ip, port, error }) => {
         if (currentFish.value?.satcomIp === ip && currentFish.value?.satcomPort1 === port) {
            connectionStatus.value = 'error'
            logs.value.push(`[${new Date().toLocaleTimeString()}] ERROR: ${error}`)
            ElMessage.error(`连接错误: ${error}`)
         }
    })

    cleanupListeners.push(onStatus, onData, onError)
  }

  return {
    currentFish,
    connectionStatus,
    logs,
    setCurrentFish,
    connect,
    disconnect,
    sendCommand,
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
