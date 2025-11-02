import { app } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'

export async function setupApp(): Promise<void> {
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
}