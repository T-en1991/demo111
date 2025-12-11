import net from 'net'
import logger from '../logger'
import { fishService, alertService } from '../database'
import { EventEmitter } from 'events'
import { logSystemEvent, LogType } from '../utils/systemLogger'

export const tcpClientEvents = new EventEmitter()

type ListenerInfo = {
  server: net.Server
  ip: string
  port: number
}

const listeners = new Map<number, ListenerInfo>() // key: fishId
const clientConnections = new Map<string, net.Socket>() // key: "ip:port"

export function getClientConnectionKey(ip: string, port: number): string {
  return `${ip}:${port}`
}

export async function connectClient(ip: string, port: number): Promise<boolean> {
  const key = getClientConnectionKey(ip, port)
  if (clientConnections.has(key)) {
    const socket = clientConnections.get(key)
    if (socket && !socket.destroyed) {
      return true
    }
    clientConnections.delete(key)
  }

  return new Promise((resolve) => {
    const socket = new net.Socket()

    const cleanup = () => {
      clientConnections.delete(key)
      tcpClientEvents.emit('status', { ip, port, status: 'disconnected' })
    }

    socket.connect(port, ip, () => {
      logger.info(`[TCP Client] Connected to ${ip}:${port}`)
      clientConnections.set(key, socket)
      tcpClientEvents.emit('status', { ip, port, status: 'connected' })
      resolve(true)
    })

    socket.on('data', (data) => {
      const dataStr = data.toString()
      logger.info(`[TCP Client] Received ${data.length} bytes from ${ip}:${port}`)
      logSystemEvent(LogType.RECEIVE, `[TCP Client ${ip}:${port}] ${dataStr}`)
      tcpClientEvents.emit('data', { ip, port, data: dataStr })
    })

    socket.on('error', (err) => {
      logger.error(`[TCP Client] Error on ${ip}:${port}:`, err)
      tcpClientEvents.emit('error', { ip, port, error: err.message })
      cleanup()
      // If error happens during connection attempt
      resolve(false)
    })

    socket.on('close', () => {
      logger.info(`[TCP Client] Connection closed ${ip}:${port}`)
      cleanup()
    })
  })
}

export async function disconnectClient(ip: string, port: number): Promise<void> {
  const key = getClientConnectionKey(ip, port)
  const socket = clientConnections.get(key)
  if (socket) {
    socket.destroy()
    clientConnections.delete(key)
  }
}

export async function sendClient(ip: string, port: number, payload: string): Promise<boolean> {
  const key = getClientConnectionKey(ip, port)
  let socket = clientConnections.get(key)

  if (!socket || socket.destroyed) {
    // Try to reconnect?
    logger.info(`[TCP Client] Socket not found for ${ip}:${port}, attempting to connect...`)
    const connected = await connectClient(ip, port)
    if (!connected) return false
    socket = clientConnections.get(key)
  }

  if (!socket) return false

  return new Promise((resolve) => {
    const body = payload.endsWith('\n') ? payload : payload + '\n'
    socket!.write(body, (err) => {
      if (err) {
        logger.error(`[TCP Client] Write error to ${ip}:${port}:`, err)
        logSystemEvent(LogType.SEND, `[TCP Client ${ip}:${port}] Failed to send: ${payload}`)
        resolve(false)
      } else {
        logSystemEvent(LogType.SEND, `[TCP Client ${ip}:${port}] Sent: ${payload}`)
        resolve(true)
      }
    })
  })
}


export async function startListenersForAllFish(): Promise<void> {
  try {
    // ip/port 字段已移除，当前版本不再自动启动 TCP 监听。
    const count = (await fishService.findAll()).length
    logger.info(`[TCP] Listeners disabled (ip/port removed). Fishes loaded: ${count}`)
  } catch (err) {
    logger.error('[TCP] Failed to initialize listeners:', err)
  }
}

export function startListenerForFish(fishId: number, ip: string, port: number): void {
  if (listeners.has(fishId)) return

  const server = net.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`
    logger.info(`[TCP] New connection for fish ${fishId} from ${remote}`)

    socket.on('data', (data) => {
      ;(async () => {
        try {
          logger.info(`[TCP] Fish ${fishId} received ${data.length} bytes from ${remote}`)

          // Try interpret as UTF-8 text

          let asText = ''
          try {
            asText = data.toString('utf8')
            // try parse JSON
          } catch {
            // not JSON or not text
          }

          // Build alert payload
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const alertData: any = {
            title: `Alarm from fish ${fishId}`,
            message: undefined as string | undefined,
            level: 'info' as 'info' | 'warning' | 'error' | 'critical',
            type: `fish-${fishId}`,
            source: `${socket.remoteAddress}:${socket.remotePort}`,
            status: 'active' as 'active' | 'resolved' | 'acknowledged'
          }

          // Not JSON: check for known alarm text formats:
          // 1) ID=<device_id>;C=<channel_id>;IMG=<filename>;POS=<lat>,<lon>
          // 2) +++AT*SENDIM,33,2,ack,ALARM-OK,<filename>
          const txt = asText ? asText.trim() : ''
          const idFormat = /ID=([^;]+);C=([^;]+);IMG=([^;]+);POS=([^,]+),([^;\s]+)/i
          const sendimFormat = /\+\+\+AT\*SENDIM,[^,]*,[^,]*,[^,]*,ALARM-OK,([^,\r\n\s]+)/i
          const mId = idFormat.exec(txt)
          const mSendim = mId ? null : sendimFormat.exec(txt)
          let parsedFilename: string | null = null
          let parsedLat: number | null = null
          let parsedLon: number | null = null
          if (mId) {
            const deviceId = mId[1]
            const channel = mId[2]
            const filename = mId[3]
            const latStr = mId[4]
            const lonStr = mId[5]

            parsedFilename = filename
            parsedLat = Number.isFinite(Number(latStr)) ? parseFloat(latStr) : null
            parsedLon = Number.isFinite(Number(lonStr)) ? parseFloat(lonStr) : null

            alertData.title = `Alarm from device ${deviceId}`
            alertData.type = 'alarm'
            alertData.source = `${socket.remoteAddress}:${socket.remotePort}`
            alertData.message = `device=${deviceId};channel=${channel};img=${filename};pos=${latStr},${lonStr}`
            alertData.level = 'critical'

            // send ACK back to sender (keep existing behavior)
            try {
              const ack = `+++AT*SENDIM,33,2,ack,ALARM-OK,${filename}\r\n`
              socket.write(ack)
              logger.info(
                `[TCP] Sent ACK to ${socket.remoteAddress}:${socket.remotePort} -> ${ack.trim()}`
              )
            } catch (ackErr) {
              logger.error('[TCP] Failed to send ACK:', ackErr)
            }
          } else if (mSendim) {
            // Received a SENDIM-style message (probably an ACK or image-notify). Extract filename.
            const filename = mSendim[1]
            parsedFilename = filename

            alertData.title = `Alarm (SENDIM) received`
            alertData.type = 'alarm'
            alertData.source = `${socket.remoteAddress}:${socket.remotePort}`
            alertData.message = `sendim=${filename}`
            alertData.level = 'critical'
            // No further ACK necessary — this message already looks like an ACK/notification
          } else {
            // Fallback: use text if printable, otherwise base64
            const printable = asText && /[\x20-\x7E\r\n\t]/.test(asText)
            if (printable && asText.length > 0) {
              alertData.message = asText.length > 2000 ? asText.slice(0, 2000) + '...' : asText
            } else {
              // binary, store base64 summary
              const b64 = data.toString('base64')
              alertData.message = b64.length > 2000 ? b64.slice(0, 2000) + '...' : b64
            }
          }

          // Optionally include fishId in message/type
          alertData.type = alertData.type || `fish-${fishId}`

          // Persist alert to DB
          try {
            await alertService.create({
              title: alertData.title,
              message: alertData.message,
              level: alertData.level,
              type: alertData.type,
              source: alertData.source,
              status: alertData.status,
              fishId: fishId,
              imgFile: parsedFilename,
              lat: parsedLat,
              lon: parsedLon
            })
            logger.info(`[TCP] Alert created for fish ${fishId}`)
          } catch (dbErr) {
            logger.error('[TCP] Failed to create alert in DB:', dbErr)
          }
        } catch (err) {
          logger.error('[TCP] Error handling data:', err)
        }
      })()
    })

    socket.on('close', () => {
      logger.info(`[TCP] Connection closed for fish ${fishId} from ${remote}`)
    })

    socket.on('error', (err) => {
      logger.error(`[TCP] Socket error for fish ${fishId}:`, err)
    })
  })

  server.on('error', (err) => {
    logger.error(`[TCP] Server error for fish ${fishId} (${ip}:${port}):`, err)
  })

  server.listen(port, ip, () => {
    logger.info(`[TCP] Listening for fish ${fishId} on ${ip}:${port}`)
  })

  listeners.set(fishId, { server, ip, port })
}

export function stopListenerForFish(fishId: number): Promise<void> {
  return new Promise((resolve) => {
    const info = listeners.get(fishId)
    if (!info) return resolve()
    try {
      info.server.close(() => {
        logger.info(`[TCP] Server closed for fish ${fishId}`)
        listeners.delete(fishId)
        resolve()
      })
    } catch (err) {
      logger.error('[TCP] Error closing server for fish:', err)
      listeners.delete(fishId)
      resolve()
    }
  })
}

export async function stopAllListeners(): Promise<void> {
  const stops = [] as Promise<void>[]
  for (const [fishId] of listeners) {
    stops.push(stopListenerForFish(fishId))
  }
  await Promise.all(stops)
}

export async function sendRaw(ip: string, port: number, payload: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    try {
      const socket = net.createConnection({ host: ip, port }, () => {
        try {
          const body = payload.endsWith('\n') ? payload : payload + '\n'
          const data = Buffer.from(body, 'utf8')
          socket.write(data, (err) => {
            if (err) {
              logger.error(`[TCP] sendRaw write error to ${ip}:${port}:`, err)
              logSystemEvent(LogType.SEND, `[TCP Raw ${ip}:${port}] Failed to send: ${payload}`)
              try {
                socket.destroy()
              } catch {
                /* ignore */
              }
              resolve(false)
            } else {
              logSystemEvent(LogType.SEND, `[TCP Raw ${ip}:${port}] Sent: ${payload}`)
              // success
              socket.end() // close after write? Or just destroy? Usually for fire-and-forget we might just destroy after some time or let it close.
              // For simple send, we can destroy after write callback
              setTimeout(() => {
                try {
                  socket.destroy()
                } catch {
                  /* ignore */
                }
              }, 100)
              resolve(true)
            }
          })
        } catch (wErr) {
          logger.error(`[TCP] sendRaw write exception:`, wErr)
          try {
            socket.destroy()
          } catch {
            /* ignore */
          }
          resolve(false)
        }
      })

      socket.on('error', (err) => {
        logger.error(`[TCP] sendRaw connection error to ${ip}:${port}:`, err)
        resolve(false)
      })
    } catch (e) {
      logger.error(`[TCP] sendRaw exception:`, e)
      resolve(false)
    }
  })
}

export async function sendAndReceive(
  ip: string,
  port: number,
  payload: string,
  timeoutMs = 5000
): Promise<{ success: boolean; data?: string; error?: string }> {
  return new Promise((resolve) => {
    let socket: net.Socket | null = null
    let received = ''
    let isResolved = false
    const done = (result: { success: boolean; data?: string; error?: string }): void => {
      if (isResolved) return
      isResolved = true
      resolve(result)
      if (socket) {
        try {
          // socket.destroy()
        } catch {
          // ignore
        }
      }
    }

    try {
      socket = net.createConnection({ host: ip, port }, () => {
        const body = payload.endsWith('\n') ? payload : payload + '\n'
        socket!.write(body, (err) => {
          if (err) {
            logSystemEvent(LogType.SEND, `[TCP S&R ${ip}:${port}] Failed to send: ${payload}`)
            done({ success: false, error: err.message })
          } else {
            logSystemEvent(LogType.SEND, `[TCP S&R ${ip}:${port}] Sent: ${payload}`)
          }
        })
      })

      socket.on('data', (chunk) => {
        received += chunk.toString()
        console.log(`[TCP] Received data: ${received}`)
        logSystemEvent(LogType.RECEIVE, `[TCP S&R ${ip}:${port}] Received: ${received}`)
        done({ success: true, data: received })
      })

      socket.on('error', (err) => {
        done({ success: false, error: err.message })
      })

      socket.setTimeout(timeoutMs, () => {
        done({ success: false, error: 'Timeout' })
      })
    } catch (e) {
      done({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}
