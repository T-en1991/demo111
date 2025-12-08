import { app, ipcMain, shell, dialog } from 'electron'
import { spawn } from 'child_process'
import { existsSync, statSync } from 'fs'
import { basename } from 'path'
import logger from '../logger'

export function registerSystemIpc(): void {
  // Keep existing ping channel behavior
  ipcMain.on('ping', () => console.log('pong'))
  // Quit application from renderer
  ipcMain.on('app:quit', () => {
    app.quit()
  })

  // 打开本机 WinSCP（跨平台处理，macOS 优先使用 open -a）
  ipcMain.handle('app:openWinSCP', async (): Promise<boolean> => {
    try {
      if (process.platform === 'darwin') {
        return await new Promise<boolean>((resolve) => {
          const child = spawn('open', ['-a', 'WinSCP'])
          child.on('error', (err) => {
            logger.error('Failed to launch WinSCP via open -a:', err)
            resolve(false)
          })
          child.on('exit', (code) => resolve(code === 0))
        })
      }
      if (process.platform === 'win32') {
        const programFiles = process.env['ProgramFiles'] || 'C\\Program Files'
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C\\Program Files (x86)'
        const candidates = [
          `${programFiles}\\WinSCP\\WinSCP.exe`,
          `${programFilesX86}\\WinSCP\\WinSCP.exe`,
          'C\\Program Files\\WinSCP\\WinSCP.exe',
          'C\\Program Files (x86)\\WinSCP\\WinSCP.exe'
        ]
        const exe = candidates.find((p) => existsSync(p))
        if (!exe) {
          logger.error('WinSCP.exe not found in default locations')
          return false
        }
        return await new Promise<boolean>((resolve) => {
          const child = spawn(exe, [], { detached: true, stdio: 'ignore' })
          child.on('error', (err) => {
            logger.error('Failed to launch WinSCP.exe:', err)
            resolve(false)
          })
          child.unref()
          resolve(true)
        })
      }
      await shell.openExternal('winscp://')
      return true
    } catch (e) {
      logger.error('Failed to open WinSCP:', e)
      return false
    }
    })

    // 打开本地选择 Excel 文件（多选），返回数组或 null
    ipcMain.handle('dialog:openXlsx', async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: '选择 Excel 文件',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
        })
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null
        return result.filePaths.map((p) => {
          let size = 0
          try {
            size = statSync(p).size
          } catch {}
          return { path: p, name: basename(p), size }
        })
      } catch (e) {
        logger.error('dialog:openXlsx failed', e)
        return null
      }
    })

    // 打开本地选择视频文件（多选），返回数组（取消时返回空数组）
    ipcMain.handle('dialog:openVideos', async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: '选择视频文件',
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'flv', 'wmv'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) return []
        return result.filePaths.map((p) => {
          let size = 0
          try {
            size = statSync(p).size
          } catch {}
          return { path: p, name: basename(p), size }
        })
      } catch (e) {
        logger.error('dialog:openVideos failed', e)
        return []
      }
    })
}
