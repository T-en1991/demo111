#!/usr/bin/env node
const { SerialPort } = require('serialport')
const fs = require('fs')
const path = require('path')

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { port: 'COM1', baud: 115200, file: 'E:\\winscp\\Logs\\anomaly_alerts\\session_20251206_060000\\fm_20251220_141057.jpg', name: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--port' && args[i + 1]) opts.port = args[++i]
    else if (a === '--baud' && args[i + 1]) opts.baud = Number(args[++i])
    else if (a === '--file' && args[i + 1]) opts.file = args[++i]
    else if (a === '--name' && args[i + 1]) opts.name = args[++i]
  }
  return opts
}

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = new Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
      }
      table[n] = c >>> 0
    }
    crc32.table = table
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  c = (c ^ 0xffffffff) >>> 0
  return c.toString(16).toUpperCase().padStart(8, '0')
}

function buildFrames(filePath, nameOverride) {
  const data = fs.readFileSync(filePath)
  const base64 = data.toString('base64')
  const crc = crc32(data)
  const name = nameOverride || path.basename(filePath)
  
  const CHUNK_SIZE = 1800 // ~1.8KB
  const total = Math.ceil(base64.length / CHUNK_SIZE)
  const frames = []
  
  for (let i = 0; i < total; i++) {
    const chunk = base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    const current = i + 1
    // First frame includes CRC and NAME, subsequent frames can just have ID and index
    const header = i === 0 
      ? `I A4C1 ${current}/${total} CRC=${crc} NAME=${name}`
      : `I A4C1 ${current}/${total}`
      
    const line = `${header}\n${chunk}\r\n`
    frames.push(line)
  }
  
  return { frames, crc, name, size: data.length }
}

async function main() {
  const opts = parseArgs()
  if (!fs.existsSync(opts.file)) {
    console.error(`File not found: ${opts.file}`)
    process.exit(1)
  }
  const { frames, crc, name, size } = buildFrames(opts.file, opts.name)
  console.log(`Port=${opts.port} Baud=${opts.baud}`)
  console.log(`File=${opts.file} Name=${name} Size=${size} bytes CRC=${crc}`)
  console.log(`Total frames: ${frames.length}`)

  const port = new SerialPort({ path: opts.port, baudRate: opts.baud, autoOpen: true })
  
  port.on('error', (e) => {
    console.error('Serial error:', e)
    process.exitCode = 1
  })

  port.on('open', async () => {
    console.log('Serial opened')
    
    for (let i = 0; i < frames.length; i++) {
      await new Promise((resolve, reject) => {
        port.write(frames[i], (err) => {
          if (err) {
            console.error(`Write frame ${i+1} failed:`, err)
            reject(err)
            return
          }
          console.log(`Sent frame ${i+1}/${frames.length}: ${frames[i].length} bytes`)
          setTimeout(resolve, 300) // Delay between frames
        })
      })
    }
    
    console.log('All frames sent')
    setTimeout(() => {
      try { port.close() } catch (_) {}
      console.log('Done')
    }, 500)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
