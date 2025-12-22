import { ipcMain } from 'electron'
import { fishService, historyService, videoService, importService, alertService, systemLogService } from '../database/index.js'

export function registerDatabaseIpc(): void {
  // Fish CRUD 操作

  // 获取所有机器鱼
  ipcMain.handle('fish:findAll', async () => {
    try {
      return await fishService.findAll()
    } catch (error) {
      console.error('Error finding all fish:', error)
      throw error
    }
  })

  // 根据ID查找机器鱼
  ipcMain.handle('fish:findById', async (_, id: number) => {
    try {
      return await fishService.findById(id)
    } catch (error) {
      console.error('Error finding fish by id:', error)
      throw error
    }
  })

  // 搜索机器鱼
  ipcMain.handle(
    'fish:search',
    async (
      _,
      query: {
        name?: string
        type?: string
        status?: 'running' | 'stopped'
      }
    ) => {
      try {
        return await fishService.search(query)
      } catch (error) {
        console.error('Error searching fish:', error)
        throw error
      }
    }
  )

  // 创建机器鱼
  ipcMain.handle(
    'fish:create',
    async (
      _,
      data: {
        name: string
        ip?: string | null
        port?: number | null
        rtspUrl?: string | null
        rtsp2?: string | null
        starlinkRtspMono?: string | null
        starlinkRtspStereo?: string | null
        satcomIp?: string | null
        satcomPort1?: number | null
        satcomPort2?: number | null
        microwaveIp?: string | null
        microwavePort?: number | null
        acousticLon?: number | null
        acousticLat?: number | null
        type?: string
        status?: 'running' | 'stopped'
        ascendCommand?: string | null
        descendCommand?: string | null
        forwardCommand?: string | null
        leftCommand?: string | null
        rightCommand?: string | null
        manualCommand?: string | null
        exitManualCommand?: string | null
        returnCommand?: string | null
        description?: string | null
        track?: import('@prisma/client').Prisma.JsonValue | null
      }
    ) => {
      try {
        return await fishService.create(data)
      } catch (error) {
        console.error('Error creating fish:', error)
        const message = error instanceof Error ? error.message : String(error)
        return { error: message }
      }
    }
  )

  // 更新机器鱼
  ipcMain.handle(
    'fish:update',
    async (
      _,
      id: number,
      data: {
        name?: string
        ip?: string | null
        port?: number | null
        rtspUrl?: string | null
        rtsp2?: string | null
        starlinkRtspMono?: string | null
        starlinkRtspStereo?: string | null
        satcomIp?: string | null
        satcomPort1?: number | null
        satcomPort2?: number | null
        microwaveIp?: string | null
        microwavePort?: number | null
        acousticLon?: number | null
        acousticLat?: number | null
        type?: string
        status?: 'running' | 'stopped'
        ascendCommand?: string | null
        descendCommand?: string | null
        forwardCommand?: string | null
        leftCommand?: string | null
        rightCommand?: string | null
        manualCommand?: string | null
        exitManualCommand?: string | null
        returnCommand?: string | null
        description?: string | null
        track?: import('@prisma/client').Prisma.JsonValue | null
      }
    ) => {
      try {
        return await fishService.update(id, data)
      } catch (error) {
        console.error('Error updating fish:', error)
        throw error
      }
    }
  )

  // 删除机器鱼
  ipcMain.handle('fish:delete', async (_, id: number) => {
    try {
      return await fishService.delete(id)
    } catch (error) {
      console.error('Error deleting fish:', error)
      throw error
    }
  })

  // 批量删除机器鱼
  ipcMain.handle('fish:deleteMany', async (_, ids: number[]) => {
    try {
      return await fishService.deleteMany(ids)
    } catch (error) {
      console.error('Error deleting multiple fish:', error)
      throw error
    }
  })

  // 批量生成假数据
  ipcMain.handle('fish:seed', async (_, count: number) => {
    try {
      return await fishService.seedMocks(Math.max(0, Number(count) || 0))
    } catch (error) {
      console.error('Error seeding fish mocks:', error)
      throw error
    }
  })

  // 保存历史记录
  ipcMain.handle(
    'history:create',
    async (
      _,
      data: {
        time: string
        content?: string
        rawLine?: string | null
        lon?: number | null
        lat?: number | null
        depth?: number | null
        height?: number | null
        battery?: number | null
        signalStrength?: number | null
        rollDeg?: number | null
        pitchDeg?: number | null
        yawDeg?: number | null
      }
    ) => {
      try {
        return await historyService.create(data)
      } catch (error) {
        console.error('Error creating history:', error)
        throw error
      }
    }
  )

  // 保存视频记录（独立表：videos）
  ipcMain.handle(
    'video:create',
    async (
      _,
      data: {
        path: string
        name: string
        size?: number | null
        camera?: 'mono' | 'stereo' | 'unknown'
        recordedAt?: string | Date | null
        endedAt?: string | Date | null
      }
    ) => {
      try {
        return await videoService.create(data)
      } catch (error) {
        console.error('Error creating video:', error)
        throw error
      }
    }
  )

  ipcMain.handle('video:findByMoment', async (_, moment: string) => {
    try {
      return await videoService.findByMoment(moment)
    } catch (error) {
      console.error('Error finding video by moment:', error)
      throw error
    }
  })

  ipcMain.handle(
    'video:list',
    async (_, params: { page?: number; pageSize?: number; keyword?: string }) => {
      try {
        return await videoService.list(params || {})
      } catch (error) {
        console.error('Error listing videos:', error)
        throw error
      }
    }
  )

  ipcMain.handle('video:get', async (_, id: number) => {
    try {
      return await videoService.get(Number(id))
    } catch (error) {
      console.error('Error getting video:', error)
      throw error
    }
  })

  ipcMain.handle('video:delete', async (_, id: number) => {
    try {
      return await videoService.delete(Number(id))
    } catch (error) {
      console.error('Error deleting video:', error)
      throw error
    }
  })

  ipcMain.handle('history:importXlsx', async (_, filePath: string) => {
    try {
      return await importService.importHistoryFromXlsx(String(filePath))
    } catch (error) {
      console.error('Error importing history from xlsx:', error)
      // Return structured error so renderer can present a clear message
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 获取历史记录列表（支持分页和时间范围）
  ipcMain.handle('history:list', async (_, params: {
    page?: number
    pageSize?: number
    startTime?: string
    endTime?: string
  } = {}) => {
    try {
      return await historyService.list(params)
    } catch (error) {
      console.error('Error listing history:', error)
      throw error
    }
  })

  // 获取报警记录列表（支持分页、时间范围和fromSocket过滤）
  ipcMain.handle('alert:list', async (_, params: {
    page?: number
    pageSize?: number
    startTime?: string
    endTime?: string
    fromSocket?: boolean
  } = {}) => {
    try {
      return await alertService.list(params)
    } catch (error) {
      console.error('Error listing alerts:', error)
      throw error
    }
  })

  // 系统日志操作
  ipcMain.handle(
    'systemLog:create',
    async (
      _,
      data: {
        content: string
        type: string
        time?: string
      }
    ) => {
      try {
        return await systemLogService.create(data)
      } catch (error) {
        console.error('Error creating system log:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'systemLog:list',
    async (
      _,
      params: {
        page?: number
        pageSize?: number
        startTime?: string
        endTime?: string
        type?: string
      } = {}
    ) => {
      try {
        return await systemLogService.list(params)
      } catch (error) {
        console.error('Error listing system logs:', error)
        throw error
      }
    }
  )

  ipcMain.handle('systemLog:clear', async () => {
    try {
      return await systemLogService.clear()
    } catch (error) {
      console.error('Error clearing system logs:', error)
      throw error
    }
  })
}
