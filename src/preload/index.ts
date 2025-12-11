import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  quitApp(): void {
    ipcRenderer.send('app:quit')
  },
  // 打开本地 WinSCP（通过主进程）
  openWinSCP(): Promise<boolean> {
    return ipcRenderer.invoke('app:openWinSCP')
  },
  dialog: {
    openVideos(): Promise<Array<{ path: string; name: string; size: number }>> {
      return ipcRenderer.invoke('dialog:openVideos')
    }
    ,
    openXlsx(): Promise<Array<{ path: string; name: string; size: number }> | null> {
      return ipcRenderer.invoke('dialog:openXlsx')
    },
    openDirectory(): Promise<string | null> {
      return ipcRenderer.invoke('dialog:openDirectory')
    }
  },
  alarm: {
    listFiles(folderPath: string): Promise<Array<{ name: string; size: number }>> {
      return ipcRenderer.invoke('alarm:listFiles', folderPath)
    },
    importFolder(folderPath: string): Promise<{ ok: number; fail: number; updated: number }> {
      return ipcRenderer.invoke('alarm:importFolder', folderPath)
    }
  },
  history: {
    create(data: {
      time: string
      content?: string
      lon?: number | null
      lat?: number | null
      depth?: number | null
      height?: number | null
      battery?: number | null
      signalStrength?: number | null
    }): Promise<any> {
      return ipcRenderer.invoke('history:create', data)
    },
    importXlsx(filePath: string): Promise<any> {
      return ipcRenderer.invoke('history:importXlsx', filePath)
    },
    list(params: {
      page?: number
      pageSize?: number
      startTime?: string
      endTime?: string
    } = {}): Promise<any> {
      return ipcRenderer.invoke('history:list', params)
    }
  },
  alert: {
    list(params: {
      page?: number
      pageSize?: number
      startTime?: string
      endTime?: string
    } = {}): Promise<any> {
      return ipcRenderer.invoke('alert:list', params)
    }
  },

  video: {
    create(data: {
      path: string
      name: string
      size?: number | null
      camera?: 'mono' | 'stereo' | 'unknown'
      recordedAt?: string | Date | null
    }): Promise<any> {
      return ipcRenderer.invoke('video:create', data)
    },
    list(params: { page?: number; pageSize?: number; keyword?: string } = {}): Promise<any> {
      return ipcRenderer.invoke('video:list', params)
    },
    get(id: number): Promise<any> {
      return ipcRenderer.invoke('video:get', id)
    },
    delete(id: number): Promise<any> {
      return ipcRenderer.invoke('video:delete', id)
    }
  },

  // Fish database operations
  fish: {
    findAll: () => ipcRenderer.invoke('fish:findAll'),
    findById: (id: number) => ipcRenderer.invoke('fish:findById', id),
    search: (query: { name?: string; type?: string; status?: 'running' | 'stopped' }) =>
      ipcRenderer.invoke('fish:search', query),
    create: (data: {
      name: string
      // 新增：卫通与微波通信参数
      satcomIp?: string | null
      satcomPort1?: number | null
      satcomPort2?: number | null
      microwaveIp?: string | null
      microwavePort?: number | null
      type?: string
      status?: 'running' | 'stopped'
      ascendCommand?: string | null
      descendCommand?: string | null
      forwardCommand?: string | null
      leftCommand?: string | null
      rightCommand?: string | null
      manualCommand?: string | null
      returnCommand?: string | null
      description?: string | null
      track?: import('@prisma/client').Prisma.JsonValue | null
    }) => ipcRenderer.invoke('fish:create', data),
    update: (
      id: number,
      data: {
        name?: string
        // 新增：卫通与微波通信参数
        satcomIp?: string | null
        satcomPort1?: number | null
        satcomPort2?: number | null
        microwaveIp?: string | null
        microwavePort?: number | null
        type?: string
        status?: 'running' | 'stopped'
        ascendCommand?: string | null
        descendCommand?: string | null
        forwardCommand?: string | null
        leftCommand?: string | null
        rightCommand?: string | null
        manualCommand?: string | null
        returnCommand?: string | null
        description?: string | null
        track?: import('@prisma/client').Prisma.JsonValue | null
      }
    ) => ipcRenderer.invoke('fish:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('fish:delete', id),
    deleteMany: (ids: number[]) => ipcRenderer.invoke('fish:deleteMany', ids),
    seed: (count: number) => ipcRenderer.invoke('fish:seed', count)
  },

  systemLog: {
    create: (data: { content: string; type: string; time?: string }) =>
      ipcRenderer.invoke('systemLog:create', data),
    list: (params: {
      page?: number
      pageSize?: number
      startTime?: string
      endTime?: string
      type?: string
    }) => ipcRenderer.invoke('systemLog:list', params),
    clear: () => ipcRenderer.invoke('systemLog:clear')
  },

  // RTSP流控制接口
  rtsp: {
    // 启动RTSP流（使用参数控制流类型）
    start: (rtspUrl: string, streamType?: 'monocular' | 'binocular') =>
      ipcRenderer.invoke('rtsp:start', rtspUrl, streamType),
    // 停止RTSP流
    stop: () => ipcRenderer.invoke('rtsp:stop'),
    // 获取当前活动流信息
    getActiveStream: () => ipcRenderer.invoke('rtsp:getActiveStream')
  },
  tcp: {
    send: (ip: string, port: number, payload: string) =>
      ipcRenderer.invoke('tcp:send', ip, port, payload),
    sendAndReceive: (ip: string, port: number, payload: string) =>
      ipcRenderer.invoke('tcp:send-and-receive', ip, port, payload),
    connect: (ip: string, port: number) => ipcRenderer.invoke('tcp:connect', ip, port),
    disconnect: (ip: string, port: number) => ipcRenderer.invoke('tcp:disconnect', ip, port),
    sendClient: (ip: string, port: number, payload: string) =>
      ipcRenderer.invoke('tcp:send-client', ip, port, payload),
    onData: (
      callback: (payload: { ip: string; port: number; data: string }) => void
    ): (() => void) => {
      const subscription = (
        _: unknown,
        payload: { ip: string; port: number; data: string }
      ): void => callback(payload)
      ipcRenderer.on('tcp:data', subscription)
      return () => {
        ipcRenderer.removeListener('tcp:data', subscription)
      }
    },
    onStatus: (
      callback: (payload: { ip: string; port: number; status: string }) => void
    ): (() => void) => {
      const subscription = (
        _: unknown,
        payload: { ip: string; port: number; status: string }
      ): void => callback(payload)
      ipcRenderer.on('tcp:status', subscription)
      return () => {
        ipcRenderer.removeListener('tcp:status', subscription)
      }
    },
    onError: (
      callback: (payload: { ip: string; port: number; error: string }) => void
    ): (() => void) => {
      const subscription = (
        _: unknown,
        payload: { ip: string; port: number; error: string }
      ): void => callback(payload)
      ipcRenderer.on('tcp:error', subscription)
      return () => {
        ipcRenderer.removeListener('tcp:error', subscription)
      }
    }
  }
  ,
  serial: {
    list: (): Promise<Array<{ path: string; manufacturer?: string; serialNumber?: string }>> =>
      ipcRenderer.invoke('serial:list'),
    open: (path: string, opts?: { baudRate?: number }): Promise<boolean> =>
      ipcRenderer.invoke('serial:open', { path, baudRate: opts?.baudRate }),
    close: (): Promise<boolean> => ipcRenderer.invoke('serial:close'),
    write: (text: string): Promise<boolean> => ipcRenderer.invoke('serial:write', text),
    onData(handler: (payload: { line: string; parsed: null | { kind: 'SURF'; time: string; csq: number } }) => void): () => void {
      const fn = (_: any, payload: any) => handler(payload)
      ipcRenderer.on('serial:data', fn)
      return () => ipcRenderer.removeListener('serial:data', fn)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
