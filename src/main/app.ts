import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { getMainWindow } from './windows/mainWindow'
import { connectDatabase, disconnectDatabase } from './database'
import logger from './logger'
import { prisma } from './database/index'

import { stopAllListeners } from './network/tcpManager'
import { startRtspRelay, stopRtspRelay } from './rtspRelay'
import { startFileServer } from './fileServer'

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

  // 启动RTSP流转换服务（如果有鱼配置了RTSP URL）
  try {
    // 从数据库获取鱼的信息
    const firstFish = await prisma.fish.findFirst({
      where: { OR: [{ rtspUrl: { not: null } }, { rtsp2: { not: null } }] },
      orderBy: { id: 'asc' }
    })

    // 只取第一条配置了RTSP URL的鱼
    if (firstFish) {
      // 默认启动单目RTSP流（如果有配置）
      if (firstFish.rtspUrl) {
        await startRtspRelay({ rtspUrl: firstFish.rtspUrl, wsPort: 8085 })
        console.log('RTSP流已启动（默认使用单目）')
      }
    } else {
      console.log('没有找到配置了RTSP URL的鱼数据，RTSP中继服务未启动')
    }
  } catch (error) {
    console.error('启动RTSP流时出错:', error)
  }

  // 启动本地文件视频服务，用于在渲染进程播放本地视频文件
  try {
    startFileServer(18081)
  } catch (e) {
    logger.error('Failed to start file server:', e)
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
