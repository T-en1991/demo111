import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import { DelimiterParser } from '@serialport/parser-delimiter'
import logger from '../logger'
import { logSystemEvent, LogType } from '../utils/systemLogger'
import { fishService, alertService, imageFrameService } from '../database'
import { ProtocolParser } from '../protocol/ProtocolParser'
import { getMainWindow } from '../windows/mainWindow'

let port: SerialPort | null = null
let parser: DelimiterParser | null = null

// 发送响应
function sendResponse(response: string): void {
  if (!port) {
    logger.error('sendResponse: port is not open')
    return
  }
  try {
    const data = response + '\r\n'
    port.write(data, (err) => {
      if (err) {
        logger.error('sendResponse write error:', err)
        logSystemEvent(LogType.SEND, `[Serial] Failed to send response: ${response}`)
      } else {
        logger.info(`sendResponse: ${response}`)
        logSystemEvent(LogType.SEND, `[Serial] Sent response: ${response}`)
      }
    })
  } catch (e) {
    logger.error('sendResponse error:', e)
  }
}

// 处理完整图片数据
async function handleCompleteImageData(
  imageId: string,
  filename: string
): Promise<void> {
  try {
    const frames = await imageFrameService.getFrames(imageId)
    // 拼接完整数据
    const completeData = frames.map((f) => f.data).join('')

    // 根据filename查找对应的alert
    const targetAlert = await alertService.findByFilename(filename)
    if (targetAlert) {
      // 更新alert的imageBase64字段
      await alertService.update(targetAlert.id, {
        imageBase64: 'data:image/jpeg;base64,' + completeData
      })
      logger.info(`Image ${imageId}: Successfully updated alert ${targetAlert.id} with image data`)
    } else {
      logger.warn(`Image ${imageId}: No alert found with filename ${filename}`)
    }

    // 发送DONE响应
    sendResponse(`DONE ${imageId}`)

    // Notify renderer that image is complete
    sendToRenderer('serial:image-complete', { imageId, filename })
  } catch (e) {
    logger.error(`handleCompleteImageData error:`, e)
    sendResponse(`RESEND ${imageId}`)
  }
}

function getWindow(): BrowserWindow | null {
  try {
    return typeof getMainWindow === 'function' ? getMainWindow() : null
  } catch {
    return null
  }
}

function sendToRenderer(channel: string, payload: unknown): void {
  try {
    const win = getWindow()
    if (win) {
      win.webContents.send(channel, payload)
      return
    }
    // Fallback: broadcast to all open windows when main window not available yet
    const wins = BrowserWindow.getAllWindows()
    for (const w of wins) {
      try {
        w.webContents.send(channel, payload)
      } catch {
          // ignore
      }
    }
  } catch {
    // swallow to avoid crashing background handlers
  }
}

export async function writeToSerial(text: string): Promise<boolean> {
  try {
    if (!port) throw new Error('serial not open')
    const data = text.endsWith('\r\n') ? text : text + '\r\n'
    await new Promise<void>((resolve, reject) =>
      port!.write(data, (err) => (err ? reject(err) : resolve()))
    )
    logSystemEvent(LogType.SEND, `[Serial ${port.path}] Sent: ${text}`)
    return true
  } catch (e) {
    logger.error('writeToSerial failed', e)
    logSystemEvent(LogType.SEND, `[Serial] Failed to send: ${text}`)
    return false
  }
}

export function registerSerialIpc(): void {
  ipcMain.handle('serial:list', async () => {
    const { SerialPort } = await import('serialport')
    try {
      const ports = await SerialPort.list()
      return ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber
      }))
    } catch (e) {
      logger.error('serial:list failed', e)
      return []
    }
  })

  // Add handler to fetch progress
  ipcMain.handle('image:progress', async (_evt, imageId: string) => {
    try {
      return await imageFrameService.getProgress(imageId)
    } catch (e) {
      logger.error('image:progress failed', e)
      return { collected: 0, total: 0 }
    }
  })

  ipcMain.handle('serial:open', async (_evt, cfg: { path: string; baudRate?: number }) => {
    try {
      if (port) {
        try {
          port.close()
        } catch {
            // ignore
        }
        port = null
      }
      port = new SerialPort({ path: cfg.path, baudRate: cfg.baudRate ?? 115200 })
      parser = port.pipe(new DelimiterParser({ delimiter: Buffer.from('\n') }))

      // Reuse the same data handler logic
      setupDataHandler(parser, cfg.path)

      return true
    } catch (e) {
      logger.error('serial:open failed', e)
      return false
    }
  })

  ipcMain.handle('serial:close', async () => {
    try {
      if (parser) {
        parser.removeAllListeners()
        parser = null
      }
      if (port) {
        await new Promise<void>((resolve) => port!.close(() => resolve()))
        port = null
      }
      return true
    } catch (e) {
      logger.error('serial:close failed', e)
      return false
    }
  })

  ipcMain.handle('serial:write', async (_evt, text: string) => {
    try {
      if (!port) throw new Error('serial not open')
      const data = text.endsWith('\r\n') ? text : text + '\r\n'
      await new Promise<void>((resolve, reject) =>
        port!.write(data, (err) => (err ? reject(err) : resolve()))
      )
      logSystemEvent(LogType.SEND, `[Serial ${port.path}] Sent: ${text}`)
      return true
    } catch (e) {
      logger.error('serial:write failed', e)
      logSystemEvent(LogType.SEND, `[Serial] Failed to send: ${text}`)
      return false
    }
  })
}

// Extract data handler to reuse in both manual open and auto listener
function setupDataHandler(parser: DelimiterParser, path: string): void {
  let currentHeader:
    | { id: string; current: number; total: number; crc: string; filename: string }
    | undefined

  parser.on('data', async (chunk: Buffer) => {
    const line = chunk.toString('utf8').replace(/\r$/, '')
    // console.log('Received line:', line, new Date().toLocaleString())
    logSystemEvent(LogType.RECEIVE, `[Serial ${path}] ${line}`)
    sendToRenderer('serial:data', { line, parsed: null })

    const event = ProtocolParser.parseIridium(line)

    if (!event) return

    if (event.type === 'SURF') {
      sendToRenderer('serial:surf', {
        time: event.timestamp,
        csq: event.csq,
        raw: line,
        port: path
      })
      logSystemEvent(LogType.RECEIVE, `[Serial ${path}] ,time: ${event.timestamp}, CSQ: ${event.csq}`)
    } else if (event.type === 'IMAGE_CHUNK') {
      const data = event.data
      if (!data) return

      if (data.isHeader) {
        // Header or Both
        const { id, current, total, crc, filename, inline } = data
        currentHeader = { id, current, total, crc, filename }

        if (inline) {
            // Both header and data in one line
             logger.info(`Received image inline frame: id=${id}, frame=${current}/${total}`)
             try {
                await imageFrameService.create({
                  imageId: id,
                  current,
                  total,
                  data: inline,
                  crc,
                  filename
                })
                const count = await imageFrameService.countFrames(id)
                sendToRenderer('serial:image-progress', { imageId: id, collected: count, total, filename })
                if (count >= total) {
                  logger.info(`Image ${id}: All frames received (inline), processing...`)
                  await handleCompleteImageData(id, filename)
                }
             } catch (err) {
                logger.error('Failed to save inline image frame:', err)
             }
        } else {
            // Header only
            logger.info(
                `Received image header: id=${id}, current=${current}/${total}, crc=${crc}, filename=${filename}`
            )
            // Notify renderer of progress start/update
            sendToRenderer('serial:image-progress', { imageId: id, current, total, filename })
        }
      } else {
        // Data only
        if (currentHeader) {
            const { id, current, total, crc, filename } = currentHeader
            logger.info(`Received image data frame: id=${id}, frame=${current}/${total}`)
            try {
              // Save to DB
              await imageFrameService.create({
                imageId: id,
                current: current,
                total: total,
                data: data.content,
                crc,
                filename
              })

              // Check progress
              const count = await imageFrameService.countFrames(id)
              sendToRenderer('serial:image-progress', {
                imageId: id,
                collected: count,
                total,
                filename
              })

              if (count >= total) {
                logger.info(`Image ${id}: All frames received, processing...`)
                await handleCompleteImageData(id, filename)
              }
            } catch (err) {
              logger.error('Failed to save image frame:', err)
            }
        } else {
             logger.warn(
              `Received image data frame but no matching header found: ${line.substring(0, 20)}...`
            )
        }
      }
    }
  })

  // Propagate errors
  parser.on('error', (err) => {
    sendToRenderer('serial:data', { line: `ERROR: ${String(err)}`, parsed: null })
  })
}

// 在应用启动后自动监听：读取配置了 serialPortPath 的鱼，自动打开对应串口并监听 SURF
export async function startSerialAutoListener(): Promise<void> {
  try {
    const fishes = await fishService.findAll()
    // 兼容旧字段 microwaveIp (如果 Prisma 类型未更新)
    const target = fishes.find((f) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fAny = f as any
        return (fAny.serialPortPath || fAny.microwaveIp)
    })

    if (!target) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fAny = target as any
    const path = (fAny.serialPortPath || fAny.microwaveIp) as string
    const baudRate = (fAny.serialBaudRate || fAny.microwavePort) ?? 9600

    if (!path) return

    // 若已有端口则先关闭
    if (port) {
      try {
        port.close()
      } catch {
          // ignore
      }
      port = null
    }
    port = new SerialPort({ path, baudRate })
    parser = port.pipe(new DelimiterParser({ delimiter: Buffer.from('\n') }))

    setupDataHandler(parser, path)

    logger.info(`Auto serial listening on ${path} with baudRate ${baudRate}`)
  } catch (e) {
    logger.error('startSerialAutoListener failed', e)
  }
}
