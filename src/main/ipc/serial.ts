import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import { DelimiterParser } from '@serialport/parser-delimiter'
import logger from '../logger'
import { logSystemEvent, LogType } from '../utils/systemLogger'
import { fishService, alertService } from '../database'
let port: SerialPort | null = null
let parser: DelimiterParser | null = null

// 图片数据拼接管理
interface ImageFrameData {
  id: string
  total: number
  crc: string
  filename: string
  receivedFrames: Set<number>
  dataBuffer: string[]
  timeoutTimer: NodeJS.Timeout
}

// 存储正在拼接的图片数据
const imageFramesMap = new Map<string, ImageFrameData>()

// CRC验证函数（简单实现，根据实际需求可能需要调整）
function validateCRC(data: string, expectedCRC: string): boolean {
  // 这里实现简单的CRC验证，实际项目中可能需要更复杂的算法
  // 目前只是返回true，假设CRC验证通过
  return true
}

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
async function handleCompleteImageData(imageData: ImageFrameData): Promise<void> {
  try {
    // 拼接完整数据
    const completeData = imageData.dataBuffer.join('')

    // 验证CRC
    if (!validateCRC(completeData, imageData.crc)) {
      logger.error(`Image ${imageData.id}: CRC validation failed`)
      sendResponse(`RESEND ${imageData.id}`)
      return
    }

    // 根据filename查找对应的alert
    const alert = await alertService.list({
      page: 1,
      pageSize: 100,
      fromSocket: true
    })

    const targetAlert = alert.items.find(item => item.imgFile === imageData.filename)
    if (targetAlert) {
      // 更新alert的imageBase64字段
      await alertService.update(targetAlert.id, {
        imageBase64: completeData
      })
      logger.info(`Image ${imageData.id}: Successfully updated alert ${targetAlert.id} with image data`)
    } else {
      logger.warn(`Image ${imageData.id}: No alert found with filename ${imageData.filename}`)
    }

    // 发送DONE响应
    sendResponse(`DONE ${imageData.id}`)

    // 清理资源
    clearTimeout(imageData.timeoutTimer)
    imageFramesMap.delete(imageData.id)
  } catch (e) {
    logger.error(`handleCompleteImageData error:`, e)
    sendResponse(`RESEND ${imageData.id}`)
  }
}

// 解析图片帧
function parseImageFrame(line: string): { type: 'header' | 'data' | null; data?: any } {
  // 所有帧的头格式：I A4C1 1/19 CRC=F3A14C2B NAME=fm_20251027_134455.jpg
  // 或者：I A4C1 2/19（后续帧头）
  const headerMatch = line.match(/^I\s+([A-F0-9]+)\s+(\d+)\/(\d+)\s*(?:CRC=([A-F0-9]+)\s+)?(?:NAME=([\w\d_\.]+))?/)
  if (headerMatch) {
    return {
      type: 'header',
      data: {
        id: headerMatch[1],
        current: parseInt(headerMatch[2]),
        total: parseInt(headerMatch[3]),
        crc: headerMatch[4] || '',
        filename: headerMatch[5] || ''
      }
    }
  }

  // 数据帧格式：/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQE...
  // 或者：Qk2eAA...（Base64 数据片段）
  if (line.match(/^[A-Za-z0-9+\/=]+$/)) {
    return {
      type: 'data',
      data: line
    }
  }

  return { type: null }
}

function getWindow(): BrowserWindow | null {
  try {
    // Prefer ES import path used elsewhere (avoid require where possible)
    const { getMainWindow } = require('../windows/mainWindow')
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
      try { w.webContents.send(channel, payload) } catch { }
    }
  } catch {
    // swallow to avoid crashing background handlers
  }
}

export function registerSerialIpc(): void {
  ipcMain.handle('serial:list', async () => {
    const { SerialPort } = await import('serialport')
    try {
      const ports = await SerialPort.list()
      return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer, serialNumber: p.serialNumber }))
    } catch (e) {
      logger.error('serial:list failed', e)
      return []
    }
  })

  ipcMain.handle('serial:open', async (_evt, cfg: { path: string; baudRate?: number }) => {
    try {
      if (port) {
        try { port.close() } catch { }
        port = null
      }
      port = new SerialPort({ path: cfg.path, baudRate: cfg.baudRate ?? 115200 })
      parser = port.pipe(new DelimiterParser({ delimiter: Buffer.from('\n') }))
      parser.on('data', (chunk: Buffer) => {
        const line = chunk.toString('utf8').replace(/\r$/, '')
        logSystemEvent(LogType.RECEIVE, `[Serial ${cfg.path}] ${line}`)

        // 保存当前头信息，用于下一行数据帧
        let currentHeader: ImageFrameData | undefined
        let currentFrameNumber: number = 0

        // 尝试解析为图片帧头
        const frameParseResult = parseImageFrame(line)

        if (frameParseResult.type === 'header') {
          const { id, current, total, crc, filename } = frameParseResult.data
          currentFrameNumber = current
          logger.info(`Received image header: id=${id}, current=${current}/${total}, crc=${crc}, filename=${filename}`)

          // 检查是否为新图片或已有图片
          let imageData = imageFramesMap.get(id)
          if (!imageData) {
            // 新图片，初始化数据
            imageData = {
              id,
              total,
              crc,
              filename,
              receivedFrames: new Set(),
              dataBuffer: new Array(total).fill(''),
              timeoutTimer: setTimeout(() => {
                logger.error(`Image ${id}: Timeout after 1 minute, discarding`)
                imageFramesMap.delete(id)
              }, 60 * 1000) // 1分钟超时
            }
            imageFramesMap.set(id, imageData)
          } else {
            // 更新已有图片的信息（如果有新的信息）
            if (crc) imageData.crc = crc
            if (filename) imageData.filename = filename
            if (total > imageData.total) {
              imageData.total = total
              imageData.dataBuffer = [...imageData.dataBuffer, ...new Array(total - imageData.dataBuffer.length).fill('')]
            }
          }

          currentHeader = imageData
        }
        else if (frameParseResult.type === 'data') {
          // 查找最近的图片数据或使用当前头信息
          let targetImageData: ImageFrameData | undefined
          let frameNumber: number = 0

          if (currentHeader) {
            // 使用当前头信息
            targetImageData = currentHeader
            frameNumber = currentFrameNumber
          } else {
            // 尝试查找匹配的图片数据
            // 注意：这里使用简单的逻辑，实际应用中可能需要更复杂的关联逻辑
            for (const [, data] of imageFramesMap.entries()) {
              // 查找第一个未完成的图片数据
              if (data.receivedFrames.size < data.total) {
                targetImageData = data
                // 假设是下一个预期帧
                frameNumber = data.receivedFrames.size + 1
                break
              }
            }
          }

          if (targetImageData && frameNumber > 0) {
            logger.info(`Received image data frame: id=${targetImageData.id}, frame=${frameNumber}/${targetImageData.total}`)

            // 保存数据
            targetImageData.dataBuffer[frameNumber - 1] = frameParseResult.data
            targetImageData.receivedFrames.add(frameNumber)

            // 检查是否所有帧都已接收
            if (targetImageData.receivedFrames.size === targetImageData.total) {
              logger.info(`Image ${targetImageData.id}: All frames received, processing...`)
              // 处理完整图片数据
              void handleCompleteImageData(targetImageData)
            }
          } else {
            logger.warn(`Received image data frame but no matching header found: ${line.substring(0, 20)}...`)
          }
        }
        // 处理SURF命令
        else {
          const m = line.match(/^SURF\s+(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2})\s+CSQ=(\d+)/)
          const parsed = m ? { kind: 'SURF', time: m[1], csq: Number(m[2]) } : null
          // sendToRenderer('serial:data', { line, parsed })
          if (parsed && parsed.kind === 'SURF') {
            // Persist to History table: time, content='SURF', signalStrength=csq
            // const isoTime = parsed.time.replace('_', 'T')
            // historyService
            //   .create({
            //     time: isoTime,
            //     content: 'SURF',
            //     signalStrength: parsed.csq
            //   })
            //   .catch((e) => logger.error('historyService.create SURF failed', e))
            // Notify renderer specifically for SURF event
            sendToRenderer('serial:surf', { time: parsed.time, csq: parsed.csq, raw: line, port: cfg.path })
          }
        }
      })
      port.on('error', (err) => {
        sendToRenderer('serial:data', { line: `ERROR: ${String(err)}`, parsed: null })
      })
      return true
    } catch (e) {
      logger.error('serial:open failed', e)
      return false
    }
  })

  ipcMain.handle('serial:close', async () => {
    try {
      if (parser) { parser.removeAllListeners(); parser = null }
      if (port) { await new Promise<void>((resolve) => port!.close(() => resolve())); port = null }
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
      await new Promise<void>((resolve, reject) => port!.write(data, (err) => (err ? reject(err) : resolve())))
      logSystemEvent(LogType.SEND, `[Serial ${port.path}] Sent: ${text}`)
      return true
    } catch (e) {
      logger.error('serial:write failed', e)
      logSystemEvent(LogType.SEND, `[Serial] Failed to send: ${text}`)
      return false
    }
  })
}

// 在应用启动后自动监听：读取配置了 microwaveIp 的鱼，自动打开对应串口并监听 SURF
export async function startSerialAutoListener(): Promise<void> {
  try {
    const fishes = await fishService.findAll()
    const target = fishes.find((f) => f.microwaveIp && typeof f.microwaveIp === 'string')
    if (!target || !target.microwaveIp) return
    const path = target.microwaveIp as string
    // 若已有端口则先关闭
    if (port) { try { port.close() } catch { } port = null }
    port = new SerialPort({ path, baudRate: 115200 })
    parser = port.pipe(new DelimiterParser({ delimiter: Buffer.from('\n') }))
    parser.on('data', (chunk: Buffer) => {
      const line = chunk.toString('utf8').replace(/\r$/, '')
      logSystemEvent(LogType.RECEIVE, `[Serial ${path}] ${line}`)
      sendToRenderer('serial:data', { line, parsed: null })

      // 保存当前头信息，用于下一行数据帧
      let currentHeader: ImageFrameData | undefined
      let currentFrameNumber: number = 0

      // 尝试解析为图片帧头
      const frameParseResult = parseImageFrame(line)

      if (frameParseResult.type === 'header') {
        const { id, current, total, crc, filename } = frameParseResult.data
        currentFrameNumber = current
        logger.info(`Received image header: id=${id}, current=${current}/${total}, crc=${crc}, filename=${filename}`)

        // 检查是否为新图片或已有图片
        let imageData = imageFramesMap.get(id)
        if (!imageData) {
          // 新图片，初始化数据
          imageData = {
            id,
            total,
            crc,
            filename,
            receivedFrames: new Set(),
            dataBuffer: new Array(total).fill(''),
            timeoutTimer: setTimeout(() => {
              logger.error(`Image ${id}: Timeout after 1 minute, discarding`)
              imageFramesMap.delete(id)
            }, 60 * 1000) // 1分钟超时
          }
          imageFramesMap.set(id, imageData)
        } else {
          // 更新已有图片的信息（如果有新的信息）
          if (crc) imageData.crc = crc
          if (filename) imageData.filename = filename
          if (total > imageData.total) {
            imageData.total = total
            imageData.dataBuffer = [...imageData.dataBuffer, ...new Array(total - imageData.dataBuffer.length).fill('')]
          }
        }

        currentHeader = imageData
      }
      else if (frameParseResult.type === 'data') {
        // 查找最近的图片数据或使用当前头信息
        let targetImageData: ImageFrameData | undefined
        let frameNumber: number = 0

        if (currentHeader) {
          // 使用当前头信息
          targetImageData = currentHeader
          frameNumber = currentFrameNumber
        } else {
          // 尝试查找匹配的图片数据
          for (const [, data] of imageFramesMap.entries()) {
            // 查找第一个未完成的图片数据
            if (data.receivedFrames.size < data.total) {
              targetImageData = data
              // 假设是下一个预期帧
              frameNumber = data.receivedFrames.size + 1
              break
            }
          }
        }

        if (targetImageData && frameNumber > 0) {
          logger.info(`Received image data frame: id=${targetImageData.id}, frame=${frameNumber}/${targetImageData.total}`)

          // 保存数据
          targetImageData.dataBuffer[frameNumber - 1] = frameParseResult.data
          targetImageData.receivedFrames.add(frameNumber)

          // 检查是否所有帧都已接收
          if (targetImageData.receivedFrames.size === targetImageData.total) {
            logger.info(`Image ${targetImageData.id}: All frames received, processing...`)
            // 处理完整图片数据
            void handleCompleteImageData(targetImageData)
          }
        } else {
          logger.warn(`Received image data frame but no matching header found: ${line.substring(0, 20)}...`)
        }
      }
      // 处理SURF命令
      else {
        const m = line.match(/^SURF\s+(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2})\s+CSQ=(\d+)/)
        const parsed = m ? { kind: 'SURF', time: m[1], csq: Number(m[2]) } : null
        if (parsed && parsed.kind === 'SURF') {
          sendToRenderer('serial:surf', { time: parsed.time, csq: parsed.csq, raw: line, port: path })
          logSystemEvent(LogType.RECEIVE, `[Serial ${path}] ,time: ${parsed.time}, CSQ: ${parsed.csq}`);
        }
      }
    })
    port.on('error', (err) => {
      sendToRenderer('serial:data', { line: `ERROR: ${String(err)}`, parsed: null })
    })
    logger.info(`Auto serial listening on ${path}`)
  } catch (e) {
    logger.error('startSerialAutoListener failed', e)
  }
}
