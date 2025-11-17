import { app, ipcMain, shell } from 'electron'
import { spawn } from 'child_process'
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
      // Windows/Linux 尝试使用注册的 URL 协议
      await shell.openExternal('winscp://')
      return true
    } catch (e) {
      logger.error('Failed to open WinSCP:', e)
      return false
    }
  })
}
