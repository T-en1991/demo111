import { ipcMain } from 'electron'
import { sendRaw, sendAndReceive, connectClient, disconnectClient, sendClient, tcpClientEvents } from '../network/tcpManager'
import logger from '../logger'
import { getMainWindow } from '../windows/mainWindow'
import { alertService } from '../database'
import { logSystemEvent, LogType } from '../utils/systemLogger'

export function registerTcpIpc(): void {
  // Forward TCP events to renderer
  tcpClientEvents.on('data', (payload) => {
    const win = getMainWindow()
    if (win) {
      win.webContents.send('tcp:data', payload)
    }

    // 策略解析：报警帧 + 落库 + 系统日志
    try {
      const txt = String(payload?.data || '').trim()
      const ip = String(payload?.ip || '')
      const port = Number(payload?.port || 0)
      if (!txt) return

      //'+++AT:96:RECVIM,55,2,1,ack,757857,-16,296,-0.0378,ID=01;C=01;IMG=fm_20251220_132512.jpg;POS=0.0000,0.0000\r\n+++AT:116:USBLANGLES,1325377475.019626,1325377474.170448,2,-2.2959,-0.4586,-1.7643,-0.4293,0.0307,0.0766,0.5695,-16,296,0.0114'

      const idPattern = /ID=([^;]+)/i
      const cPattern = /C=([^;]+)/i
      const imgPattern = /IMG=([^;]+)/i
      const posPattern = /POS=([^,]+),([^;|\s]+)/i

      let parsed: { id?: string; c?: string; img?: string; lat?: number | null; lon?: number | null } | null = null

      const idMatch = idPattern.exec(txt)
      const cMatch = cPattern.exec(txt)
      const imgMatch = imgPattern.exec(txt)
      const posMatch = posPattern.exec(txt)

      if (idMatch && cMatch && imgMatch && posMatch) {
        const id = idMatch[1]
        const c = cMatch[1]
        const img = imgMatch[1]
        const latStr = posMatch[1]
        const lonStr = posMatch[2]

        const lat = !isNaN(Number(latStr)) ? Number(latStr) : null
        const lon = !isNaN(Number(lonStr)) ? Number(lonStr) : null

        parsed = {
          id,
          c,
          img,
          lat,
          lon
        }
      }

      // If parsed alarm, persist and log
      if (parsed) {
        void (async () => {
          try {
            console.log('Attempting to create alert:', parsed) // Debug log
            const createdAlert = await alertService.create({
              title: `Alarm from socket ${ip}:${port}`,
              message: `id=${parsed.id ?? ''};c=${parsed.c ?? ''};img=${parsed.img ?? ''};pos=${parsed.lat ?? ''},${parsed.lon ?? ''}`,
              level: 'critical',
              type: 'alarm',
              source: `${ip}:${port}`,
              status: 'active',
              fishId: null,
              imgFile: parsed.img ?? null,
              lat: parsed.lat ?? null,
              lon: parsed.lon ?? null,
              fromSocket: true,
              imageBase64: null
            })
            console.log('Alert created successfully:', createdAlert) // Debug log
            logSystemEvent(LogType.RECEIVE, `[TCP ${ip}:${port}] ALARM ${txt}`)

            // Send ACK response
            if (parsed.img) {
              const imageName = parsed.img
              const ackContent = `ALARM-OK,${imageName}`
              const length = ackContent.length
              const ackMessage = `+++AT*SENDIM,${length},2,ack,${ackContent}`

              const sent = await sendClient(ip, port, ackMessage)
              if (sent) {
                logger.info(`[TCP] Sent ACK to ${ip}:${port}: ${ackMessage}`)
                logSystemEvent(LogType.SEND, `[TCP ${ip}:${port}] ACK ${ackMessage}`)
              } else {
                logger.error(`[TCP] Failed to send ACK to ${ip}:${port}`)
              }
            }
          } catch (e) {
            logger.error('Persist alarm failed:', e)
          }
        })()
      }
    } catch (e) {
      logger.error('Alarm parse failed:', e)
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

