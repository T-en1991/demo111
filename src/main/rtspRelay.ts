// src/main/rtspRelay.ts
// Electron 主进程：RTSP 转 WebSocket 推流服务
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { WebSocketServer, WebSocket } from 'ws'


// 管理多个RTSP中继实例
const relays = new Map<number, WebSocketServer>()

export interface RtspRelayOptions {
  rtspUrl: string
  wsPort?: number
}

export async function startRtspRelay({ rtspUrl, wsPort = 8085 }: RtspRelayOptions) {
  // 检查是否提供了rtspUrl
  if (!rtspUrl) {
    console.warn('No RTSP URL provided, skipping RTSP relay startup')
    return
  }
  const finalRtspUrl = rtspUrl
  // 如果该端口已存在服务，先关闭
  if (relays.has(wsPort)) {
    stopRtspRelay(wsPort)
  }
  const wss = new WebSocketServer({ port: wsPort })
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected')
    //const ffmpegCmd = resolveFfmpegPath()
    const child = spawn(
      'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
      [
        '-rtsp_transport',
        'tcp',
        '-analyzeduration',
        '10000000',
        '-probesize',
        '10000000',
        '-i',
        finalRtspUrl,
        '-vf',
        'format=yuv420p,scale=640:360',
        '-c:v',
        'mpeg1video',
        '-b:v',
        '2000k',
        '-codec:a',
        'mp2',
        '-b:a',
        '128k',
        '-strict',
        '-2',
        '-tune',
        'zerolatency',
        '-muxdelay',
        '0',
        '-f',
        'mpegts',
        '-r',
        '30',
        'pipe:1'
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const out = child.stdout
    if (out) {
      out.on('data', (data) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data)
        }
      })
    }
    child.on('error', (err) => {
      console.error('FFmpeg spawn error:', err)
      try { ws.close() } catch {}
    })
    child.on('close', (code) => {
      console.log('ffmpeg process closed, code', code)
      ws.close()
    })
    ws.on('close', () => {
      child && child.kill('SIGINT')
    })
    ws.on('error', () => {
      child && child.kill('SIGINT')
    })
  })
  // 存储WebSocket服务器实例
  relays.set(wsPort, wss)
  console.log(`RTSP relay started. RTSP: ${finalRtspUrl} => ws://localhost:${wsPort}/`)
}

function resolveFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH
  if (envPath && existsSync(envPath)) return envPath
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C\\Program Files (x86)'
    const candidates = [
      `${programFiles}\\ffmpeg\\bin\\ffmpeg.exe`,
      `${programFilesX86}\\ffmpeg\\bin\\ffmpeg.exe`,
      'C\\ffmpeg\\bin\\ffmpeg.exe'
    ]
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
  }
  if (process.platform === 'darwin') {
    const macHomebrew = '/opt/homebrew/bin/ffmpeg'
    const macUsrLocal = '/usr/local/bin/ffmpeg'
    if (existsSync(macHomebrew)) return macHomebrew
    if (existsSync(macUsrLocal)) return macUsrLocal
  }
  return 'ffmpeg'
}

export function stopRtspRelay(wsPort?: number) {
  if (wsPort && relays.has(wsPort)) {
    // 关闭特定端口的服务器
    const wss = relays.get(wsPort)!
    wss.close()
    relays.delete(wsPort)
    console.log(`RTSP relay stopped on port ${wsPort}`)
  } else if (!wsPort) {
    // 关闭所有服务器
    relays.forEach((wss, port) => {
      wss.close()
      console.log(`RTSP relay stopped on port ${port}`)
    })
    relays.clear()
  }
}
