import { app, ipcMain } from 'electron'

export function registerSystemIpc(): void {
  // Keep existing ping channel behavior
  ipcMain.on('ping', () => console.log('pong'))
  // Quit application from renderer
  ipcMain.on('app:quit', () => {
    app.quit()
  })
}