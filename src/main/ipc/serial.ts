import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import { DelimiterParser } from '@serialport/parser-delimiter'
import logger from '../logger'
import { logSystemEvent, LogType } from '../utils/systemLogger'

let port: SerialPort | null = null
let parser: DelimiterParser | null = null

function getWindow(): BrowserWindow | null {
  try {
    const { getMainWindow } = require('../windows/mainWindow')
    return getMainWindow()
  } catch {
    return null
  }
}

function sendToRenderer(channel: string, payload: any): void {
  const win = getWindow()
  win?.webContents.send(channel, payload)
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
        try { port.close() } catch {}
        port = null
      }
      port = new SerialPort({ path: cfg.path, baudRate: cfg.baudRate ?? 115200 })
      parser = port.pipe(new DelimiterParser({ delimiter: Buffer.from('\n') }))
      parser.on('data', (chunk: Buffer) => {
        const line = chunk.toString('utf8').replace(/\r$/, '')
        const m = line.match(/^SURF\s+(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2})\s+CSQ=(\d+)/)
        const parsed = m ? { kind: 'SURF', time: m[1], csq: Number(m[2]) } : null
        logSystemEvent(LogType.RECEIVE, `[Serial ${cfg.path}] ${line}`)
        sendToRenderer('serial:data', { line, parsed })
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
