import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import { DelimiterParser } from '@serialport/parser-delimiter'
import logger from '../logger'
import { logSystemEvent, LogType } from '../utils/systemLogger'
import { fishService } from '../database'
let port: SerialPort | null = null
let parser: DelimiterParser | null = null

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
      try { w.webContents.send(channel, payload) } catch {}
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
        const m = line.match(/^SURF\s+(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2})\s+CSQ=(\d+)/)
        const parsed = m ? { kind: 'SURF', time: m[1], csq: Number(m[2]) } : null
        logSystemEvent(LogType.RECEIVE, `[Serial ${cfg.path}] ${line}`)
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
      const m = line.match(/^SURF\s+(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2})\s+CSQ=(\d+)/)
      const parsed = m ? { kind: 'SURF', time: m[1], csq: Number(m[2]) } : null
      sendToRenderer('serial:data', { line, parsed })
      if (parsed && parsed.kind === 'SURF') {
        //  const isoTime = parsed.time.replace('_', 'T')
        // historyService
        //   .create({ time: isoTime, content: 'SURF', signalStrength: parsed.csq })
        //   .catch((e) => logger.error('historyService.create SURF failed', e))
        sendToRenderer('serial:surf', { time: parsed.time, csq: parsed.csq, raw: line, port: path })
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
