import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { getMainWindow } from './windows/mainWindow'
import { connectDatabase, disconnectDatabase } from './database'
import logger from './logger'


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

    app.on('before-quit', async () => {
    await disconnectDatabase()
  })
}