import { app, BrowserWindow } from 'electron'
import { setupApp } from './app'
import { createMainWindow } from './windows/mainWindow'
import { registerIpc } from './ipc'
import { startListenersForAllFish } from './network/tcpManager'
import logger from './logger'
async function bootstrap(): Promise<void> {
  await setupApp()
  // Ensure Electron app is ready before creating BrowserWindow
  await app.whenReady()
  // Create main window and register IPC handlers
  createMainWindow()
  registerIpc()
  // Start TCP listeners for fish that have ip/port configured
  startListenersForAllFish().catch((err) => logger.error('Failed to start fish listeners:', err))

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
}

bootstrap()

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
