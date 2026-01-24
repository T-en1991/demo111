import { ipcMain } from 'electron'
import { sendRaw, sendAndReceive, connectClient, disconnectClient, sendClient, tcpClientEvents } from '../network/tcpManager'
import logger from '../logger'
import { getMainWindow } from '../windows/mainWindow'
import { alertService } from '../database'
import { logSystemEvent, LogType } from '../utils/systemLogger'
import { ProtocolParser } from '../protocol/ProtocolParser'
import { CommandGenerator } from '../protocol/CommandGenerator'
import { AcousticCommandType } from '../protocol/types'

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

      const event = ProtocolParser.parseAcoustic(txt)
      if (event && event.type === 'ALARM') {
          // payload: ...ID=01;C=01;IMG=filename...
          // Need to extract filename/pos from payload
          const payloadStr = event.payload
          const idMatch = payloadStr.match(/ID=([^;]+)/)
          const cMatch = payloadStr.match(/C=([^;]+)/)
          const imgMatch = payloadStr.match(/IMG=([^;]+)/)
          const posMatch = payloadStr.match(/POS=([^,]+),([^;|\s]+)/)

          const id = idMatch ? idMatch[1] : undefined
          const c = cMatch ? cMatch[1] : undefined
          const img = imgMatch ? imgMatch[1] : undefined

          let lat: number | null = null
          let lon: number | null = null

          if (posMatch) {
              lat = parseFloat(posMatch[1])
              lon = parseFloat(posMatch[2])
          }

          void (async () => {
            try {
              // Create Alert
               const createdAlert = await alertService.create({
                  title: `Alarm from socket ${ip}:${port}`,
                  message: payloadStr,
                  level: c || '',
                  type: 'alarm',
                  source: `${ip}:${port}`,
                  status: 'active',
                  fishId: null,
                  imgFile: img ?? null,
                  lat: lat ?? null,
                  lon: lon ?? null,
                  fromSocket: true,
                  imageBase64: null
                })
                logger.info('Alert created successfully:', createdAlert.id)
                logSystemEvent(LogType.RECEIVE, `[TCP ${ip}:${port}] ALARM ${txt}`)

                // Send ACK
                if (img) {
                    const targetId = id || 2
                    // Build ACK: +++AT*SENDIM,<len>,<dest>,ack,ALARM-OK,filename
                    const ackMessage = CommandGenerator.buildAcoustic(targetId, AcousticCommandType.ALARM_OK, [img])

                    const sent = await sendClient(ip, port, ackMessage)
                    if (sent) {
                        logger.info(`[TCP] Sent ACK to ${ip}:${port}: ${ackMessage}`)
                        logSystemEvent(LogType.SEND, `[TCP ${ip}:${port}] ACK ${ackMessage}`)
                    } else {
                        logger.error(`[TCP] Failed to send ACK to ${ip}:${port}`)
                    }
                }
            } catch (e) {
                logger.error('Persist alarm/ack failed:', e)
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
