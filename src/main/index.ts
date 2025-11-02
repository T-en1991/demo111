import { app, BrowserWindow } from 'electron'
import { setupApp } from './app'
import { createMainWindow } from './windows/mainWindow'
import { registerIpc } from './ipc'
async function bootstrap(): Promise<void> {
  await setupApp()
  // Create main window and register IPC handlers
  createMainWindow()
  registerIpc()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
}

bootstrap()

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
