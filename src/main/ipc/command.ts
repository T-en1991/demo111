import { ipcMain } from 'electron'
import { fishService } from '../database'
import { CommandGenerator } from '../protocol/CommandGenerator'
import { AcousticCommandType, IridiumCommandType } from '../protocol/types'
import { sendClient } from '../network/tcpManager'
import { writeToSerial } from './serial'
import logger from '../logger'

export function registerCommandIpc(): void {
  ipcMain.handle('fish:sendCommand', async (_evt, payload: {
    fishId: number
    protocol: 'acoustic' | 'iridium'
    command: string
    params?: string[]
  }) => {
    try {
      const { fishId, protocol, command, params = [] } = payload
      const fish = await fishService.findById(fishId)
      if (!fish) {
        throw new Error(`Fish ${fishId} not found`)
      }

      let cmdStr = ''
      let success = false

      if (protocol === 'acoustic') {
        // Acoustic uses TCP
        const targetId = fish.acousticId || 2
        cmdStr = CommandGenerator.buildAcoustic(targetId, command as AcousticCommandType, params)

        // 使用 satcomIp/satcomPort1 而不是 ip/port
        const ip = fish.satcomIp
        const port = fish.satcomPort1

        if (!ip || !port) {
            throw new Error('Fish IP/Port (satcomIp/satcomPort1) not configured for Acoustic communication')
        }

        success = await sendClient(ip, port, cmdStr)

      } else if (protocol === 'iridium') {
        // Iridium uses Serial
        const targetId = fish.acousticId || '01'
        cmdStr = CommandGenerator.buildIridium(targetId, command as IridiumCommandType, params)

        // Use global serial port for now (limitation of single port architecture)
        success = await writeToSerial(cmdStr)
      }

      return { success, command: cmdStr }
    } catch (e) {
      logger.error('fish:sendCommand failed:', e)
      return { success: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
