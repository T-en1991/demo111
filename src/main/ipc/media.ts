import { ipcMain } from 'electron'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { extname } from 'path'
import logger from '../logger'

function getFfmpegPath(): string {
  if (process.platform === 'win32') return 'ffmpeg.exe'
  if (existsSync('/opt/homebrew/bin/ffmpeg')) return '/opt/homebrew/bin/ffmpeg'
  if (existsSync('/usr/local/bin/ffmpeg')) return '/usr/local/bin/ffmpeg'
  return 'ffmpeg'
}

export function registerMediaIpc(): void {
  ipcMain.handle('media:transcode', async (_, filePath: string) => {
    logger.info(`[media:transcode] Request to transcode: ${filePath}`)
    
    if (!filePath || !existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const ext = extname(filePath).toLowerCase()
    if (ext !== '.mkv') {
      logger.info(`[media:transcode] Not an MKV file, skipping: ${filePath}`)
      return filePath // Return original if not MKV
    }

    const outputPath = filePath.replace(/\.mkv$/i, '.mp4')
    if (existsSync(outputPath)) {
      logger.info(`[media:transcode] MP4 already exists: ${outputPath}`)
      return outputPath
    }

    const ffmpegCmd = getFfmpegPath()
    logger.info(`[media:transcode] Starting ffmpeg conversion: ${filePath} -> ${outputPath}`)

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegCmd, [
        '-i', filePath,
        '-c:v', 'copy', // Copy video stream if compatible (H.264 in MKV is common)
        '-c:a', 'aac',  // Ensure audio is AAC (compatible with MP4)
        '-strict', 'experimental',
        outputPath
      ])

      ffmpeg.stderr.on('data', (data) => {
        // ffmpeg writes progress to stderr
        // logger.debug(`[ffmpeg] ${data}`)
      })

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          logger.info(`[media:transcode] Success: ${outputPath}`)
          resolve(outputPath)
        } else {
          logger.error(`[media:transcode] ffmpeg exited with code ${code}`)
          reject(new Error(`ffmpeg exited with code ${code}`))
        }
      })

      ffmpeg.on('error', (err) => {
        logger.error(`[media:transcode] Failed to spawn ffmpeg: ${err.message}`)
        reject(err)
      })
    })
  })
}
