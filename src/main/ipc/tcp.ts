import { ipcMain } from 'electron'
import { sendRaw, sendAndReceive, connectClient, disconnectClient, sendClient, tcpClientEvents } from '../network/tcpManager'
import logger from '../logger'
import { getMainWindow } from '../windows/mainWindow'

export function registerTcpIpc(): void {
  // Forward TCP events to renderer
  tcpClientEvents.on('data', (payload) => {
    const win = getMainWindow()
    if (win) {
      win.webContents.send('tcp:data', payload)
    }
  })

  tcpClientEvents.on('status', (payload) => {
    const win = getMainWindow()
    if (win) {
      win.webContents.send('tcp:status', payload)
    }
  })

  tcpClientEvents.on('error', (payload) => {
    const win = getMainWindow()
    if (win) {
      win.webContents.send('tcp:error', payload)
    }
  })

  ipcMain.handle('tcp:connect', async (_evt, ip: string, port: number) => {
    try {
      return await connectClient(ip, Number(port))
    } catch (e) {
      logger.error('tcp:connect failed:', e)
      return false
    }
  })

  ipcMain.handle('tcp:disconnect', async (_evt, ip: string, port: number) => {
    try {
      await disconnectClient(ip, Number(port))
      return true
    } catch (e) {
      logger.error('tcp:disconnect failed:', e)
      return false
    }
  })

  ipcMain.handle('tcp:send-client', async (_evt, ip: string, port: number, payload: string) => {
    try {
      return await sendClient(ip, Number(port), payload)
    } catch (e) {
      logger.error('tcp:send-client failed:', e)
      return false
    }
  })

  ipcMain.handle('tcp:send', async (_evt, ip: string, port: number, payload: string) => {
    try {
      if (!ip || !port || !payload) {
        throw new Error('Invalid tcp:send parameters')
      }
      const ok = await sendRaw(ip, Number(port), String(payload))
      return { success: ok }
    } catch (e) {
      logger.error('tcp:send failed:', e)
      return { success: false, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(
    'tcp:send-and-receive',
    async (_evt, ip: string, port: number, payload: string) => {
      try {
        if (!ip || !port || !payload) {
          throw new Error('Invalid tcp:send-and-receive parameters')
        }
        const result = await sendAndReceive(ip, Number(port), String(payload), 3000)
        return result
      } catch (e) {
        logger.error('tcp:send-and-receive failed:', e)
        return { success: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )
}

