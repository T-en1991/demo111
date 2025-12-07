import { ElectronAPI } from '@electron-toolkit/preload'
type Prisma = import('@prisma/client').Prisma
type Fish = import('@prisma/client').Fish

declare global {
  interface RtspResponse {
    success: boolean
    message: string
    wsPort?: number
  }

  interface Window {
    electron: ElectronAPI
    api: {
      quitApp(): void
      openWinSCP(): Promise<boolean>
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
        }): Promise<any>
      }
      fish: {
        findAll(): Promise<Fish[]>
        findById(id: number): Promise<Fish | null>
        search(query: {
          name?: string
          type?: string
          status?: 'running' | 'stopped'
        }): Promise<Fish[]>
        create(data: {
          name: string
          ip?: string | null
          port?: number | null
          rtspUrl?: string | null
          rtsp2?: string | null
          type?: string
          status?: 'running' | 'stopped'
          // 新增：卫通与微波通信参数
          satcomIp?: string | null
          satcomPort1?: number | null
          satcomPort2?: number | null
          microwaveIp?: string | null
          microwavePort?: number | null
          // 控制命令与描述
          ascendCommand?: string | null
          descendCommand?: string | null
          forwardCommand?: string | null
          leftCommand?: string | null
          rightCommand?: string | null
          manualCommand?: string | null
          exitManualCommand?: string | null
          returnCommand?: string | null
          description?: string | null
          track?: Prisma.JsonValue | null
        }): Promise<Fish>
        update(
          id: number,
          data: {
            name?: string
            ip?: string | null
            port?: number | null
            rtspUrl?: string | null
            rtsp2?: string | null
            type?: string
            status?: 'running' | 'stopped'
            // 新增：卫通与微波通信参数
            satcomIp?: string | null
            satcomPort1?: number | null
            satcomPort2?: number | null
            microwaveIp?: string | null
            microwavePort?: number | null
            // 控制命令与描述
            ascendCommand?: string | null
            descendCommand?: string | null
            forwardCommand?: string | null
            leftCommand?: string | null
            rightCommand?: string | null
            manualCommand?: string | null
            exitManualCommand?: string | null
            returnCommand?: string | null
            description?: string | null
            track?: Prisma.JsonValue | null
          }
        ): Promise<Fish>
        delete(id: number): Promise<Fish>
        deleteMany(ids: number[]): Promise<Prisma.BatchPayload>
        seed(count: number): Promise<Prisma.BatchPayload>
      }
      // RTSP流控制接口
      rtsp: {
        // 启动RTSP流（使用参数控制流类型）
        start(rtspUrl: string, streamType?: 'monocular' | 'binocular'): Promise<RtspResponse>
        // 停止RTSP流
        stop(): Promise<RtspResponse>
        // 获取当前活动流信息
        getActiveStream(): Promise<{ rtspUrl: string; type: 'monocular' | 'binocular' } | null>
      }
      tcp: {
        send(
          ip: string,
          port: number,
          payload: string
        ): Promise<{ success: boolean; message?: string }>
        sendAndReceive(
          ip: string,
          port: number,
          payload: string
        ): Promise<{ success: boolean; data?: string; error?: string }>
        connect(ip: string, port: number): Promise<boolean>
        disconnect(ip: string, port: number): Promise<boolean>
        sendClient(ip: string, port: number, payload: string): Promise<boolean>
        onData(callback: (payload: { ip: string; port: number; data: string }) => void): () => void
        onStatus(
          callback: (payload: { ip: string; port: number; status: string }) => void
        ): () => void
        onError(callback: (payload: { ip: string; port: number; error: string }) => void): () => void
      }
      serial: {
        list(): Promise<Array<{ path: string; manufacturer?: string; serialNumber?: string }>>
        open(path: string, opts?: { baudRate?: number }): Promise<boolean>
        close(): Promise<boolean>
        write(text: string): Promise<boolean>
        onData(handler: (payload: { line: string; parsed: null | { kind: 'SURF'; time: string; csq: number } }) => void): () => void
      }
    }
  }
}
