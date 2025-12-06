import { ipcMain } from 'electron'
import { sendRaw, sendAndReceive } from '../network/tcpManager'
import logger from '../logger'

export function registerTcpIpc(): void {
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
