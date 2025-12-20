import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import { DelimiterParser } from '@serialport/parser-delimiter'
import logger from '../logger'
import { logSystemEvent, LogType } from '../utils/systemLogger'
import { fishService, alertService, imageFrameService } from '../database'
import { serial_FISH_STATUS_CONFIG } from '../../renderer/src/config'

let port: SerialPort | null = null
let parser: DelimiterParser | null = null

// CRC验证函数（简单实现，根据实际需求可能需要调整）
function validateCRC(_data: string, _expectedCRC: string): boolean {
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
async function handleCompleteImageData(
  imageId: string,
  filename: string,
  crc: string
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

// 解析图片帧
function parseImageFrame(line: string): { type: 'header' | 'data' | 'both' | null; data?: any } {
  // 支持两种格式：
  // 1) 头行 + 下一行纯Base64
  // 2) 单行：头 + Base64 同行
  const m = line.match(
    /^I\s+([A-F0-9]+)\s+(\d+)\/(\d+)\s*(?:CRC=([A-F0-9]+)\s+)?(?:NAME=([\w\d_\.]+))?(?:\s+([A-Za-z0-9+\/=]+))?$/
  )
  if (m) {
    const hasInlineData = !!m[6]
    return {
      type: hasInlineData ? 'both' : 'header',
      data: {
        id: m[1],
        current: parseInt(m[2]),
        total: parseInt(m[3]),
        crc: m[4] || '',
        filename: m[5] || '',
        inline: hasInlineData ? m[6] : undefined
      }
    }
  }
  if (/^[A-Za-z0-9+\/=]+$/.test(line)) {
    return { type: 'data', data: line }
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
      try {
        w.webContents.send(channel, payload)
      } catch {}
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
    // Manual open (same logic as auto, but manual trigger)
    // For simplicity, we can rely on startSerialAutoListener logic if we extract common parts,
    // but here we just implement basic open.
    // NOTE: The previous code had specific logic. To keep it robust we should probably reuse the listener logic.
    // But since user only asked to change the storage logic, I'll update the listener logic here.

    try {
      if (port) {
        try {
          port.close()
        } catch {}
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
function setupDataHandler(parser: DelimiterParser, path: string) {
  let currentHeader:
    | { id: string; current: number; total: number; crc: string; filename: string }
    | undefined

  parser.on('data', async (chunk: Buffer) => {
    const line = chunk.toString('utf8').replace(/\r$/, '')
    console.log('Received line:', line, new Date().toLocaleString())
    if (line.startsWith('CSQ_')) return
    logSystemEvent(LogType.RECEIVE, `[Serial ${path}] ${line}`)
    sendToRenderer('serial:data', { line, parsed: null })

    // Match status keywords
    const upperLine = line.toUpperCase()
    const match = serial_FISH_STATUS_CONFIG.find(k => upperLine.includes(k.keyword))
    if (match) {
      sendToRenderer('serial:status-update', { status: match.status, label: match.label })
    }

    const frameParseResult = parseImageFrame(line)

    if (frameParseResult.type === 'header') {
      const { id, current, total, crc, filename } = frameParseResult.data
      logger.info(
        `Received image header: id=${id}, current=${current}/${total}, crc=${crc}, filename=${filename}`
      )
      currentHeader = frameParseResult.data

      // Notify renderer of progress start/update
      sendToRenderer('serial:image-progress', { imageId: id, current, total, filename })
    } else if (frameParseResult.type === 'both') {
      const { id, current, total, crc, filename, inline } = frameParseResult.data
      logger.info(`Received image inline frame: id=${id}, frame=${current}/${total}`)
      currentHeader = frameParseResult.data
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
          await handleCompleteImageData(id, filename, crc)
        }
      } catch (err) {
        logger.error('Failed to save inline image frame:', err)
      }
    } else if (frameParseResult.type === 'data') {
      if (currentHeader) {
        const { id, current, total, crc, filename } = currentHeader
        logger.info(`Received image data frame: id=${id}, frame=${current}/${total}`)

        try {
          // Save to DB
          await imageFrameService.create({
            imageId: id,
            current: current,
            total: total,
            data: frameParseResult.data,
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
            await handleCompleteImageData(id, filename, crc)
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
    // 处理SURF命令
    else {
      const m = line.match(/^SURF\s+(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2})\s+CSQ=(\d+)/)
      const parsed = m ? { kind: 'SURF', time: m[1], csq: Number(m[2]) } : null
      if (parsed && parsed.kind === 'SURF') {
        sendToRenderer('serial:surf', { time: parsed.time, csq: parsed.csq, raw: line, port: path })
        logSystemEvent(
          LogType.RECEIVE,
          `[Serial ${path}] ,time: ${parsed.time}, CSQ: ${parsed.csq}`
        )
      }
    }
  })

  // Propagate errors
  parser.on('error', (err) => {
    sendToRenderer('serial:data', { line: `ERROR: ${String(err)}`, parsed: null })
  })
}

// 在应用启动后自动监听：读取配置了 microwaveIp 的鱼，自动打开对应串口并监听 SURF
export async function startSerialAutoListener(): Promise<void> {
  try {
    const fishes = await fishService.findAll()
    const target = fishes.find((f) => f.microwaveIp && typeof f.microwaveIp === 'string')
    if (!target || !target.microwaveIp) return
    const path = target.microwaveIp as string
    const baudRate = target.microwavePort ?? 9600
    // 若已有端口则先关闭
    if (port) { try { port.close() } catch { } port = null }
    port = new SerialPort({ path, baudRate })
    parser = port.pipe(new DelimiterParser({ delimiter: Buffer.from('\n') }))

    setupDataHandler(parser, path)

    logger.info(`Auto serial listening on ${path} with baudRate ${baudRate}`)
  } catch (e) {
    logger.error('startSerialAutoListener failed', e)
  }
}
