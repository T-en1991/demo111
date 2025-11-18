import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { getMainWindow } from './windows/mainWindow'
import { connectDatabase, disconnectDatabase } from './database'
import logger from './logger'
import { prisma } from './database/index'

import { stopAllListeners } from './network/tcpManager'
import { startRtspRelay, stopRtspRelay } from './rtspRelay'

export async function setupApp(): Promise<void> {
  // Check for single instance lock
  const gotTheLock = app.requestSingleInstanceLock()

  if (!gotTheLock) {
    app.quit()
    return
  }
  // Connect to database
  try {
    await connectDatabase()
  } catch (error) {
    logger.error('Failed to connect to database:', error)
  }
  // Ensure app is ready before creating windows
  await app.whenReady()

  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Quit when all windows are closed, except on macOS
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  // Handle second instance
  app.on('second-instance', () => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // Start RTSP to WebSocket relays for both cameras
  try {
    // 从数据库获取鱼的信息
    const firstFish = await prisma.fish.findFirst({
      where: { OR: [{ rtspUrl: { not: null } }, { rtsp2: { not: null } }] },
      orderBy: { id: 'asc' }
    })
    
    const monocularRtspUrl = firstFish?.rtspUrl || ''
    const binocularRtspUrl = firstFish?.rtsp2 || ''
    
    // 启动单目视频流 (默认端口 8085)
    await startRtspRelay({ rtspUrl: monocularRtspUrl, wsPort: 8085 })
    // 启动双目视频流 (默认端口 8086)
 //   await startRtspRelay({ rtspUrl: binocularRtspUrl, wsPort: 8086 })
  } catch (error) {
    console.error('Error starting RTSP relays:', error)
  }

  app.on('before-quit', async () => {
    try {
      await stopAllListeners()
      // 停止所有 RTSP 中继服务
      stopRtspRelay()
    } catch (e) {
      logger.error('Error stopping TCP listeners or RTSP relays:', e)
    }
    await disconnectDatabase()
  })
}
