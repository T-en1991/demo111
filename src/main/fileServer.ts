import { createServer, IncomingMessage, ServerResponse } from 'http'
import { existsSync, statSync, createReadStream } from 'fs'
import { spawn } from 'child_process'
import { extname } from 'path'
import logger from './logger'

let serverStarted = false
let currentPort = 18081

function contentTypeByExt(p: string): string {
  const ext = extname(p).toLowerCase()
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.mkv') return 'video/x-matroska'
  if (ext === '.avi') return 'video/x-msvideo'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.bmp') return 'image/bmp'
  return 'application/octet-stream'
}

function getFfmpegPath(): string {
  if (process.platform === 'win32') return 'ffmpeg.exe'
  if (existsSync('/opt/homebrew/bin/ffmpeg')) return '/opt/homebrew/bin/ffmpeg'
  if (existsSync('/usr/local/bin/ffmpeg')) return '/usr/local/bin/ffmpeg'
  return 'ffmpeg'
}

function handleVideo(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '', `http://localhost:${currentPort}`)
  const p = url.searchParams.get('path')
  if (!p || !existsSync(p)) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  const stat = statSync(p)
  const fileSize = stat.size
  const range = req.headers.range
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Accept-Ranges', 'bytes')

  // Check if transcoding is needed (MKV)
  const ext = extname(p).toLowerCase()
  if (ext === '.mkv') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    // Use ffmpeg to transcode to fragmented MP4
    const ffmpegCmd = getFfmpegPath()
    logger.info(`[fileServer] Transcoding MKV with ${ffmpegCmd}: ${p}`)

    const ffmpeg = spawn(ffmpegCmd, [
      '-i',
      p,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1'
    ])

    ffmpeg.stdout.pipe(res)

    ffmpeg.stderr.on('data', (d) => {
      // Uncomment for debugging
      const msg = d.toString()
      // Filter out routine progress info to avoid log spam, but show errors/warnings
      if (!msg.startsWith('frame=') && !msg.startsWith('size=')) {
        logger.info(`[ffmpeg] ${msg}`)
      }
    })

    ffmpeg.on('error', (err) => {
      logger.error(`[fileServer] ffmpeg spawn error: ${err.message}`)
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== null) {
        logger.warn(`[fileServer] ffmpeg exited with code ${code}`)
      }
    })

    req.on('close', () => {
      ffmpeg.kill()
    })
    return
  }

  const type = contentTypeByExt(p)
  if (range) {
    const match = /bytes=(\d+)-(\d+)?/.exec(range)
    const start = match ? parseInt(match[1], 10) : 0
    const end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1
    const chunkSize = end - start + 1
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
    res.setHeader('Content-Length', String(chunkSize))
    res.setHeader('Content-Type', type)
    const stream = createReadStream(p, { start, end })
    stream.pipe(res)
  } else {
    res.statusCode = 200
    res.setHeader('Content-Length', String(fileSize))
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', 'no-store')
    const stream = createReadStream(p)
    stream.pipe(res)
  }
}

function handleFile(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '', `http://localhost:${currentPort}`)
  const p = url.searchParams.get('path')
  if (!p || !existsSync(p)) {
    res.statusCode = 404
    res.end('Not found')
    return
  }
  const stat = statSync(p)
  const fileSize = stat.size
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.statusCode = 200
  res.setHeader('Content-Length', String(fileSize))
  res.setHeader('Content-Type', contentTypeByExt(p))
  res.setHeader('Cache-Control', 'no-store')
  const stream = createReadStream(p)
  stream.pipe(res)
}

export function startFileServer(port = 18081): number {
  if (serverStarted) return currentPort
  currentPort = port
  const server = createServer((req, res) => {
    try {
      if (req.url && req.url.startsWith('/video')) {
        handleVideo(req, res)
        return
      }
      if (req.url && req.url.startsWith('/file')) {
        handleFile(req, res)
        return
      }
      res.statusCode = 404
      res.end('Not found')
    } catch (e) {
      logger.error('fileServer error:', e)
      res.statusCode = 500
      res.end('Internal error')
    }
  })
  server.listen(port, () => {
    serverStarted = true
    logger.info(`[fileServer] Listening on http://localhost:${port}`)
  })
  return port
}

export function getFileServerPort(): number {
  return currentPort
}
