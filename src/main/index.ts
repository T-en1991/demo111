import { app, BrowserWindow } from 'electron'
import { setupApp } from './app'
import { startRtspRelay } from './rtspRelay'
import { prisma } from './database/index'
import { createMainWindow } from './windows/mainWindow'
import { registerIpc } from './ipc'
import { startListenersForAllFish } from './network/tcpManager'
import logger from './logger'
async function bootstrap(): Promise<void> {
  await setupApp()
  await app.whenReady()
  // 从数据库读取第一个fish的rtspUrl作为推流地址
  let dbRtspUrl = 'rtsp://localhost:8554/live'
  try {
    const firstFish = await prisma.fish.findFirst({ where: { rtspUrl: { not: null } }, orderBy: { id: 'asc' } })
    if (firstFish && firstFish.rtspUrl) dbRtspUrl = firstFish.rtspUrl
  } catch (e) {
    logger.error('Failed to load fish RTSP url from DB:', e)
  }
  startRtspRelay({ rtspUrl: process.env.RTSP_URL || dbRtspUrl, wsPort: 8085 })
  createMainWindow()
  registerIpc()
  startListenersForAllFish().catch((err) => logger.error('Failed to start fish listeners:', err))
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
}
bootstrap()

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
