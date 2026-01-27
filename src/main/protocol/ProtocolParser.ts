import { AcousticEvent, IridiumEvent } from './types'
import logger from '../logger'

export class ProtocolParser {
  // 声通正则: +++AT:98:RECVIM,58,2,1,ack,786623,-19,265,0.0012,ID=01;C=01;IMG=...
  // 或者 +++AT:51:RECVIM, 11,2,1,ack, 307243, -22, 190,0.0607, CMD-OK, SURF
  // 允许逗号前后有空格
  private static ACOUSTIC_REGEX = /\+\+\+AT:(\d+):RECVIM,\s*(\d+),\s*(\d+),\s*(\d+),\s*ack,(.*)/i

  // 透传正则: STAT,ID=01,125.25...
  private static STAT_REGEX = /^STAT,ID=(\w+),(.*)/i

  // 铱星 SURF: SURF ID=01 2025-10-25 22:43:11 CSQ=4
  private static IRIDIUM_SURF_REGEX = /SURF\s+ID=(\w+)\s+([\d-]+\s[\d:]+)\s+CSQ=(\d+)/i

  // 铱星图片分片头: I A4C1 1/19 CRC=... NAME=...
  private static IRIDIUM_CHUNK_HEADER_REGEX = /^I\s+([A-F0-9]+)\s+(\d+)\/(\d+)\s*(?:CRC=([A-F0-9]+)\s+)?(?:NAME=([\w\d_.]+))?(?:\s+([A-Za-z0-9+/=]+))?$/

  // PICSTART ID=01 filename
  private static PICSTART_REGEX = /^PICSTART\s+ID=(\w+)\s+(.*)$/i

  // 纯 Base64 数据行
  private static BASE64_REGEX = /^[A-Za-z0-9+/=]+$/

  static parseAcoustic(data: string): AcousticEvent | null {
    data = data.trim()

    // 1. 尝试匹配标准 AT 回复
    const atMatch = data.match(this.ACOUSTIC_REGEX)
    if (atMatch) {
      // const rssiPrefix = atMatch[1]
      // const len = atMatch[2]
      const src = atMatch[3] // 2 (这是发送方 ID，即鱼的 acousticId)
      // const dest = atMatch[4] // 1 (这是接收方 ID，即上位机)
      const contentRaw = atMatch[5].trim()

      // 解析 contentRaw: timestamp, rssi, val2, val3, PAYLOAD
      // 例: 786623,-19,265,0.0012,ID=01;...
      const parts = contentRaw.split(',')
      if (parts.length < 5) return null

      // const ts = parts[0]
      // const rssi = parts[1]
      // ...
      // 真正的 payload 从第 4 个逗号后开始，或者我们看关键字
      const payloadStr = parts.slice(4).join(',') // 简单处理

      if (payloadStr.includes('ID=') && payloadStr.includes('IMG=') && payloadStr.includes('POS=')) {
         return { type: 'ALARM', raw: data, srcId: src, payload: payloadStr }
      }
      if (payloadStr.includes('IMG=')) {
          const missing: string[] = []
          if (!payloadStr.includes('ID=')) missing.push('ID=')
          if (!payloadStr.includes('POS=')) missing.push('POS=')
          logger.warn(`[ProtocolParser] Potential ALARM rejected. Missing: ${missing.join(', ')}. Payload: ${payloadStr}`)
      }
      if (payloadStr.includes('CMD-OK')) {
        return { type: 'CMD_ACK', raw: data, srcId: src, payload: payloadStr }
      }
      if (payloadStr.includes('NAVIGATE-SUCCESS')) {
        return { type: 'NAV_SUCCESS', raw: data, srcId: src }
      }
      if (payloadStr.includes('MANUAL-SUCCESS')) {
        return { type: 'MAN_SUCCESS', raw: data, srcId: src }
      }
      // Reorder: Check WIFIOFF first to avoid partial match issues (though strictly strings are different)
      if (payloadStr.includes('WIFIOFF-SUCCESS')) {
        return { type: 'WIFI_OFF_SUCCESS', raw: data, srcId: src }
      }
      if (payloadStr.includes('WIFI-SUCCESS')) {
        return { type: 'WIFI_SUCCESS', raw: data, srcId: src }
      }
      if (payloadStr.includes('RETURN-SUCCESS')) {
        return { type: 'RETURN_SUCCESS', raw: data, srcId: src }
      }

      return { type: 'UNKNOWN', raw: data, srcId: src, payload: payloadStr }
    }

    // 2. 尝试匹配 STAT 透传
    const statMatch = data.match(this.STAT_REGEX)
    if (statMatch) {
      return {
        type: 'STATUS',
        raw: data,
        srcId: statMatch[1],
        payload: statMatch[2]
      }
    }

    return null
  }

  static parseIridium(data: string): IridiumEvent | null {
    data = data.trim()

    // 1. SURF
    const surfMatch = data.match(this.IRIDIUM_SURF_REGEX)
    if (surfMatch) {
      return {
        type: 'SURF',
        raw: data,
        id: surfMatch[1],
        timestamp: surfMatch[2],
        csq: parseInt(surfMatch[3], 10)
      }
    }

    // 2. PICSTART
    const picStartMatch = data.match(this.PICSTART_REGEX)
    if (picStartMatch) {
        return {
            type: 'PIC_START',
            raw: data,
            id: picStartMatch[1],
            filename: picStartMatch[2].trim()
        }
    }

    // 3. Image Chunk Header
    const chunkMatch = data.match(this.IRIDIUM_CHUNK_HEADER_REGEX)
    if (chunkMatch) {
        const hasInlineData = !!chunkMatch[6]
        return {
            type: 'IMAGE_CHUNK',
            raw: data,
            data: {
                isHeader: true,
                id: chunkMatch[1],
                current: parseInt(chunkMatch[2]),
                total: parseInt(chunkMatch[3]),
                crc: chunkMatch[4] || '',
                filename: chunkMatch[5] || '',
                inline: hasInlineData ? chunkMatch[6] : undefined
            }
        }
    }

    // 3. Image Chunk Data (Base64)
    if (this.BASE64_REGEX.test(data)) {
        return {
            type: 'IMAGE_CHUNK',
            raw: data,
            data: {
                isHeader: false,
                content: data
            }
        }
    }

    return null
  }
}
