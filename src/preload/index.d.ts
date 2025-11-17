import { ElectronAPI } from '@electron-toolkit/preload'
type Prisma = import('@prisma/client').Prisma
type Fish = import('@prisma/client').Fish

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      quitApp(): void
      openWinSCP(): Promise<boolean>
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
    }
  }
}
