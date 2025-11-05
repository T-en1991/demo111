import path from 'path'
import fs from 'fs'
import { format, createLogger, transports } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const { combine, timestamp, printf, colorize, errors } = format

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs')
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase()

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

const fileFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}] ${stack || message}`
})

const logger = createLogger({
  level: LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    fileFormat
  ),
  transports: [
    new transports.Console({
      format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), fileFormat)
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      zippedArchive: false,
      level: LOG_LEVEL
    })
  ],
  exitOnError: false
})

export default logger
