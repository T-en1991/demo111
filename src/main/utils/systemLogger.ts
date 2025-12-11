import { systemLogService } from '../database'
import logger from '../logger'

export enum LogType {
  SEND = 'send',
  RECEIVE = 'receive'
}

/**
 * 记录系统事件日志（发送/接收指令或数据）
 * @param type 类型：'send' | 'receive'
 * @param content 内容
 */
export async function logSystemEvent(type: LogType | string, content: string): Promise<void> {
  try {
    await systemLogService.create({
      content,
      type: String(type)
    })
  } catch (err) {
    logger.error('Failed to log system event:', err)
  }
}
