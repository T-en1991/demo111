// src/main/rtspRelay.ts
// Electron 主进程：RTSP 转 WebSocket 推流服务
import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { WebSocketServer, WebSocket } from 'ws'
import { prisma } from './database/index'

let wss: WebSocketServer | null = null
let ffmpeg: ChildProcess | null = null

export interface RtspRelayOptions {
  rtspUrl: string
  wsPort?: number
}

export async function startRtspRelay({ rtspUrl, wsPort = 8085 }: RtspRelayOptions) {
  // 优先使用数据库 fish.rtspUrl 字段
  let finalRtspUrl = rtspUrl
  try {
    const firstFish = await prisma.fish.findFirst({
      where: { rtspUrl: { not: null } },
      orderBy: { id: 'asc' }
    })
    if (firstFish && firstFish.rtspUrl) finalRtspUrl = firstFish.rtspUrl
    if (!finalRtspUrl) {
      console.warn('use default rtspUrl value')
      finalRtspUrl = 'rtsp://192.168.1.160:8555/0'
    }
    console.warn('use rtspUrl from db:', finalRtspUrl)
  } catch (e) {
    // ignore, fallback to param
  }
  if (wss) return // 已启动
  wss = new WebSocketServer({ port: wsPort })
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected')
    const ffmpegCmd = resolveFfmpegPath()
    ffmpeg = spawn(
      ffmpegCmd,
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
    const out = ffmpeg.stdout
    if (out) {
      out.on('data', (data) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data)
        }
      })
    }
    ffmpeg.on('error', (err) => {
      console.error('FFmpeg spawn error:', err)
      try { ws.close() } catch {}
    })
    ffmpeg.on('close', (code) => {
      console.log('ffmpeg process closed, code', code)
      ws.close()
    })
    ws.on('close', () => {
      ffmpeg && ffmpeg.kill('SIGINT')
    })
    ws.on('error', () => {
      ffmpeg && ffmpeg.kill('SIGINT')
    })
  })
  console.log(`RTSP relay started. RTSP: ${finalRtspUrl} => ws://localhost:${wsPort}/`)
}

function resolveFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH
  if (envPath && existsSync(envPath)) return envPath
  if (process.platform === 'win32') {
    const winDefault = 'C\\Program Files\\ffmpeg\\bin\\ffmpeg.exe'.replace(/\\/g, '\\')
    if (existsSync(winDefault)) return winDefault
  }
  if (process.platform === 'darwin') {
    const macHomebrew = '/opt/homebrew/bin/ffmpeg'
    const macUsrLocal = '/usr/local/bin/ffmpeg'
    if (existsSync(macHomebrew)) return macHomebrew
    if (existsSync(macUsrLocal)) return macUsrLocal
  }
  return 'ffmpeg'
}

export function stopRtspRelay() {
  if (wss) {
    wss.close()
    wss = null
  }
  if (ffmpeg) {
    ffmpeg.kill('SIGINT')
    ffmpeg = null
  }
}
