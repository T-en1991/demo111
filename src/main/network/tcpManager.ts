import net from 'net'
import logger from '../logger'
import { fishService, alertService } from '../database'

type ListenerInfo = {
    server: net.Server
    ip: string
    port: number
}

const listeners = new Map<number, ListenerInfo>() // key: fishId

export async function startListenersForAllFish(): Promise<void> {
    try {
        const fishes = await fishService.findAll()
        for (const f of fishes) {
            if (f.ip && f.port) {
                startListenerForFish(f.id, f.ip, f.port)
            }
        }
    } catch (err) {
        logger.error('[TCP] Failed to start listeners for fish:', err)
    }
}

export function startListenerForFish(fishId: number, ip: string, port: number): void {
    if (listeners.has(fishId)) return

    const server = net.createServer((socket) => {
        const remote = `${socket.remoteAddress}:${socket.remotePort}`
        logger.info(`[TCP] New connection for fish ${fishId} from ${remote}`)

        socket.on('data', (data) => {
            (async () => {
                try {
                    logger.info(`[TCP] Fish ${fishId} received ${data.length} bytes from ${remote}`)

                    // Try interpret as UTF-8 text

                    let asText = ''
                    try {
                        asText = data.toString('utf8')
                        // try parse JSON

                    } catch (e) {
                        // not JSON or not text

                    }

                    // Build alert payload
                    let alertData: any = {
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
                            logger.info(`[TCP] Sent ACK to ${socket.remoteAddress}:${socket.remotePort} -> ${ack.trim()}`)
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
