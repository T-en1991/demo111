import { AcousticCommandType, IridiumCommandType } from './types'

export class CommandGenerator {
  /**
   * 生成声通指令
   * 格式: +++AT*SENDIM,<len>,<dest>,ack,<CMD>[,params]
   */
  static buildAcoustic(
    targetId: string | number,
    cmd: AcousticCommandType | string,
    params: string[] = []
  ): string {
    const dest = String(targetId)
    // 基础命令部分
    let cmdPart = cmd
    if (params.length > 0) {
      cmdPart += ',' + params.join(',')
    }

    // 计算长度：cmd + params 的长度
    // 注意：文档中的例子长度似乎是命令字符串的长度，例如 "FORWARD" 长度为 7
    // "POS,121.8844000,30.8840878" 长度为 25
    const len = cmdPart.length

    return `+++AT*SENDIM,${len},${dest},ack,${cmdPart}`
  }

  /**
   * 生成铱星指令
   */
  static buildIridium(
    targetId: string | number,
    cmd: IridiumCommandType,
    params: string[] = []
  ): string {
    // 假设 targetId 是 fishCode (e.g. 01) 或者 acousticId
    // 用户示例: ID=01
    const id = String(targetId).padStart(2, '0')
    
    if (cmd === IridiumCommandType.PIC_START) {
      // PICSTART ID=01 filename
      const filename = params[0] || ''
      return `PICSTART ID=${id} ${filename}`
    }

    if (cmd === IridiumCommandType.DONE) {
      // DONE ID=01
      return `DONE ID=${id}`
    }

    return ''
  }
}
