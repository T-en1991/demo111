#!/usr/bin/env node
/*
 * Simple script to send a SURF line over a COM port.
 * Usage examples:
 *   npm run send:surf                # defaults to COM1, CSQ=4, current time
 *   npm run send:surf -- COM3        # specify port
 *   npm run send:surf -- COM5 7      # specify port and CSQ
 *   node scripts/send-surf.js COM4 4 2025-10-25_22:43:11
 */
const { SerialPort } = require('serialport')

function nowSurfTime() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function main() {
  const args = process.argv.slice(2)
  const portPath = args[0] || process.env.SURF_PORT || 'COM1'
  const csq = Number(args[1] || process.env.SURF_CSQ || 4)
  const time = args[2] || process.env.SURF_TIME || nowSurfTime()
  const line = `SURF ${time} CSQ=${csq}`

  console.log(`[send-surf] Opening ${portPath} at 115200...`)
  const port = new SerialPort({ path: portPath, baudRate: 115200 })
  await new Promise((resolve, reject) => {
    port.on('open', resolve)
    port.on('error', reject)
  })
  await new Promise((resolve, reject) => {
    port.write(line + '\r\n', (err) => (err ? reject(err) : resolve()))
  })
  console.log(`[send-surf] Sent: ${line}`)
  await new Promise((resolve) => port.drain(() => resolve()))
  port.close(() => console.log('[send-surf] Closed'))
}

main().catch((err) => {
  console.error('[send-surf] Failed:', err)
  process.exit(1)
})
