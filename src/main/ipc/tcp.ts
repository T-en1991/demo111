import { ipcMain } from 'electron'
import { sendRaw, sendAndReceive, connectClient, disconnectClient, sendClient, tcpClientEvents } from '../network/tcpManager'
import logger from '../logger'
import { getMainWindow } from '../windows/mainWindow'
import { alertService, fishService } from '../database'
import { logSystemEvent, LogType } from '../utils/systemLogger'
import { ProtocolParser } from '../protocol/ProtocolParser'
import { CommandGenerator } from '../protocol/CommandGenerator'
import { AcousticCommandType, AcousticEvent } from '../protocol/types'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

// 图片分片缓存
interface ImageBuffer {
  id: string // 唯一ID (e.g. A4C1)
  total: number
  chunks: Map<number, string> // index -> base64 data
  filename?: string // 如果有
  timestamp: number
}
const imageBuffers = new Map<string, ImageBuffer>()

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

      // 2. 尝试解析为铱星协议（图片/SURF）
      const iridiumEvent = ProtocolParser.parseIridium(txt)
      if (iridiumEvent) {
          if (iridiumEvent.type === 'IMAGE_CHUNK') {
              // 处理图片分片
              const { id, current, total, data } = iridiumEvent.data
              let buffer = imageBuffers.get(id)
              if (!buffer) {
                  buffer = {
                      id,
                      total,
                      chunks: new Map(),
                      timestamp: Date.now()
                  }
                  imageBuffers.set(id, buffer)
              }

              // 存储分片
              buffer.chunks.set(current, data)
              logger.info(`[TCP] Received image chunk ${current}/${total} for ${id}`)

              // 检查是否接收完毕
              if (buffer.chunks.size === total) {
                  logger.info(`[TCP] Image ${id} complete, assembling...`)

                  // 按顺序拼接
                  let base64Data = ''
                  for (let i = 1; i <= total; i++) {
                      base64Data += buffer.chunks.get(i) || ''
                  }

                  // 保存图片
                  const fileName = `img_${id}_${Date.now()}.jpg`
                  const savePath = path.join(app.getPath('userData'), 'received_images', fileName)

                  // Ensure dir exists
                  const dir = path.dirname(savePath)
                  if (!fs.existsSync(dir)) {
                      fs.mkdirSync(dir, { recursive: true })
                  }

                  try {
                      const imgBuffer = Buffer.from(base64Data, 'base64')
                      fs.writeFileSync(savePath, imgBuffer)
                      logger.info(`[TCP] Image saved to ${savePath}`)

                      // 通知前端
                      const win = getMainWindow()
                      if (win) {
                        win.webContents.send('tcp:data', {
                            ip,
                            port,
                            data: `IMAGE_SAVED:${fileName}`
                        })
                      }
                  } catch (e) {
                      logger.error(`[TCP] Failed to save image: ${e}`)
                  }

                  // 清理缓存
                  imageBuffers.delete(id)
              }
          } else if (iridiumEvent.type === 'PIC_START') {
               // 开始接收图片
               logger.info(`[TCP] PICSTART received: ID=${iridiumEvent.id} File=${iridiumEvent.filename}`)
          }
          // 只要是 Iridium 协议，处理完就 return，不再作为 Acoustic 处理
          return
      }

      // 3. 尝试解析为声通协议
      const event = ProtocolParser.parseAcoustic(txt)
      if (event) {
          void (async () => {
            try {
                // 根据声通ID (srcId) 查找对应的鱼
                let fishId: number | null = null
                if (event.srcId) {
                    const fish = await fishService.findByAcousticId(event.srcId)
                    if (fish) fishId = fish.id
                }

                if (event.type === 'ALARM') {
                  // payload: ...ID=01;C=01;IMG=filename...
                  // Need to extract filename/pos from payload
                  const payloadStr = event.payload || ''
                  // const idMatch = payloadStr.match(/ID=([^;]+)/) // unused
                  const cMatch = payloadStr.match(/C=([^;]+)/)
                  const imgMatch = payloadStr.match(/IMG=([^;]+)/)
                  // Improved POS regex: allow spaces, handle signs/decimals
                  const posMatch = payloadStr.match(/POS=\s*([-+]?[\d.]+)\s*,\s*([-+]?[\d.]+)/)

                  logger.info(`[TCP] Processing ALARM: payload=${payloadStr}`)

                  if (!imgMatch) {
                      logger.warn(`[TCP] ALARM ignored: IMG missing in payload`)
                      return
                  }
                  if (!posMatch) {
                      logger.warn(`[TCP] ALARM ignored: POS missing or invalid format`)
                      return
                  }

                  // const id = idMatch ? idMatch[1] : undefined // This is fishCode, usually matches acousticId logic but not always
                  const c = cMatch ? cMatch[1] : undefined
                  const img = imgMatch ? imgMatch[1] : undefined

                  let lat: number | null = null
                  let lon: number | null = null

                  if (posMatch) {
                      lat = parseFloat(posMatch[1])
                      lon = parseFloat(posMatch[2])
                  }

                  // Create Alert
                  const createdAlert = await alertService.create({
                      title: `Alarm from fish ${event.srcId}`,
                      message: payloadStr,
                      level: c || '',
                      type: 'alarm',
                      source: `Acoustic:${event.srcId}`,
                      status: 'active',
                      fishId: fishId, // Linked to DB ID
                      imgFile: img ?? null,
                      lat: lat ?? null,
                      lon: lon ?? null,
                      fromSocket: true,
                      imageBase64: null
                  })
                  logger.info('Alert created successfully:', createdAlert.id)
                  logSystemEvent(LogType.RECEIVE, `[TCP ${ip}:${port}] ALARM from ${event.srcId}: ${txt}`)

                  // Send ACK
                  if (img) {
                      const targetId = event.srcId || '2'
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
                } else if (event.type === 'STATUS') {
                    // STAT,ID=xx... message
                    // Do nothing here, as it's handled by frontend realtime parser via tcp:data
                    // Just log for debug if needed, but avoid spamming system logs
                    // logger.debug(`[TCP] STATUS received from ${event.srcId}`)
                } else {
                    // Other events: NAV_SUCCESS, MANUAL-SUCCESS, etc.
                    // Log as INFO alert or System Event
                    const titleMap: Record<string, string> = {
                        'NAV_SUCCESS': 'Navigation Mode Entered',
                        'MAN_SUCCESS': 'Manual Mode Entered',
                        'WIFI_SUCCESS': 'Wi-Fi Enabled',
                        'WIFI_OFF_SUCCESS': 'Wi-Fi Disabled',
                        'RETURN_SUCCESS': 'Return Mode Entered',
                        'CMD_ACK': 'Command Acknowledged'
                    }

                    const title = titleMap[event.type] || `Event: ${event.type}`

                     // Send Toast to Renderer
                     const win = getMainWindow()
                     if (win) {
                        logger.info(`[TCP] Sending toast to renderer: ${title}`)
                        win.webContents.send('tcp:alert-toast', {
                            title: title,
                            message: event.raw,
                            type: 'success'
                        })
                     } else {
                        logger.warn(`[TCP] Cannot send toast: mainWindow not found`)
                     }

                     // Skip persisting CMD_ACK and UNKNOWN to avoid cluttering the alerts table
                     if (event.type === 'CMD_ACK' || event.type === 'UNKNOWN') {
                        return
                     }

                     // Persist as info
                     await alertService.create({
                         title: title,
                        message: event.raw,
                        level: 'info',
                        type: 'event',
                        source: `Acoustic:${event.srcId}`,
                        status: 'acknowledged',
                        fishId: fishId
                    })
                    logSystemEvent(LogType.RECEIVE, `[TCP ${ip}:${port}] ${event.type} from ${event.srcId}`)
                }
            } catch (e) {
                logger.error('Process acoustic event failed:', e)
            }
          })()
      }
    } catch (e) {
      logger.error('Protocol parse failed:', e)
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
