// src/main/ipc/rtsp.ts
// RTSP流控制的IPC处理函数
import { ipcMain } from 'electron'
import { startRtspRelay, stopRtspRelay } from '../rtspRelay'
import logger from '../logger'
import { fishService } from '../database'

// 存储当前使用的RTSP URL信息
interface ActiveStreamInfo {
  rtspUrl: string
  type: 'microwaveMono' | 'microwaveStereo' | 'starlinkMono' | 'starlinkStereo'
}

let activeStream: ActiveStreamInfo | null = null

/**
 * 注册RTSP相关的IPC处理函数
 * 允许前端按需控制RTSP流的启动和停止
 */
export function registerRtspIpc(): void {
  // 启动RTSP流（使用参数控制流类型和源地址）
  ipcMain.handle(
    'rtsp:start',
    async (
      _,
      fishId: number,
      streamType?: 'microwaveMono' | 'microwaveStereo' | 'starlinkMono' | 'starlinkStereo'
    ) => {
      try {
        // 固定使用8085端口
        const wsPort = 8085

        // 根据streamType参数选择RTSP源地址，默认为微波单目
        const selectedStreamType = streamType || 'microwaveMono'

        // 从数据库获取机器鱼配置
        const fish = await fishService.findById(fishId)

        if (!fish) {
          throw new Error(`未找到ID为 ${fishId} 的机器鱼配置`)
        }
        
        logger.info(`查找到机器鱼配置: ID=${fish.id}, Name=${fish.name}, RTSP=${fish.rtspUrl}, RTSP2=${fish.rtsp2}`)

        // 根据流类型选择对应的RTSP URL
        let actualRtspUrl: string
        switch (selectedStreamType) {
          case 'microwaveMono':
            actualRtspUrl = fish.rtspUrl || 'rtsp://localhost:8554/live'
            break
          case 'microwaveStereo':
            actualRtspUrl = fish.rtsp2 || 'rtsp://localhost:8554/live2'
            break
          case 'starlinkMono':
            actualRtspUrl = fish.starlinkRtspMono || 'rtsp://localhost:8554/starlink_mono'
            break
          case 'starlinkStereo':
            actualRtspUrl = fish.starlinkRtspStereo || 'rtsp://localhost:8554/starlink_stereo'
            break
          default:
            // 默认回退到微波单目
            actualRtspUrl = fish.rtspUrl || 'rtsp://localhost:8554/live'
            break
        }

        logger.info(`最终选用的RTSP URL: ${actualRtspUrl} (类型: ${selectedStreamType})`)


        logger.info(`尝试启动RTSP流: ${actualRtspUrl} (类型: ${selectedStreamType}) 到端口 ${wsPort}`)
        await startRtspRelay({ rtspUrl: actualRtspUrl, wsPort })

        // 更新当前活动流信息
        activeStream = {
          rtspUrl: actualRtspUrl,
          type: selectedStreamType
        }

        logger.info(
          `RTSP流已成功启动: ${actualRtspUrl} -> ws://localhost:${wsPort}/ (类型: ${activeStream.type})`
        )

        return {
          success: true,
          message: `RTSP流启动成功 (类型: ${activeStream.type})`,
          wsPort,
          streamType: activeStream.type
        }
      } catch (error) {
        logger.error(`启动RTSP流失败: ${error instanceof Error ? error.message : String(error)}`)
        return {
          success: false,
          message: `启动RTSP流失败: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
  )

  // 停止RTSP流
  ipcMain.handle('rtsp:stop', async () => {
    try {
      // 固定停止8085端口的流
      logger.info('尝试停止RTSP流')
      stopRtspRelay(8085)
      activeStream = null
      return {
        success: true,
        message: 'RTSP流已停止'
      }
    } catch (error) {
      logger.error(`停止RTSP流失败: ${error instanceof Error ? error.message : String(error)}`)
      return {
        success: false,
        message: `停止RTSP流失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  })

  // 获取当前活动流信息
  ipcMain.handle('rtsp:getActiveStream', () => {
    return activeStream
  })
}
