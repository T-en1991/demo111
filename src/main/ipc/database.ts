import { ipcMain } from 'electron'
import { fishService } from '../database/index.js'

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
  ipcMain.handle('fish:search', async (_, query: {
    name?: string;
    type?: string;
    status?: 'running' | 'stopped';
  }) => {
    try {
      return await fishService.search(query)
    } catch (error) {
      console.error('Error searching fish:', error)
      throw error
    }
  })

  // 创建机器鱼
  ipcMain.handle('fish:create', async (_, data: {
    name: string;
    type: string;
    status?: 'running' | 'stopped';
    ip?: string;
    port?: number;
  }) => {
    try {
      return await fishService.create(data)
    } catch (error) {
      console.error('Error creating fish:', error)
      throw error
    }
  })

  // 更新机器鱼
  ipcMain.handle('fish:update', async (_, id: number, data: {
    name?: string;
    type?: string;
    status?: 'running' | 'stopped';
    ip?: string | null;
    port?: number | null;
  }) => {
    try {
      return await fishService.update(id, data)
    } catch (error) {
      console.error('Error updating fish:', error)
      throw error
    }
  })

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
}