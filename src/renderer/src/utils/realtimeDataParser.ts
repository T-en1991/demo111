import { Fish } from '../store/fishControl'

export interface ParserContext {
  fish: Fish
  ip: string
  port: number
}

export interface DataParseStrategy {
  /**
   * 策略名称，用于标识和调试
   */
  name: string
  /**
   * 优先级，数字越大越先执行
   */
  priority: number
  /**
   * 判断该策略是否能处理当前数据
   */
  match(data: string): boolean
  /**
   * 处理数据
   */
  handle(data: string, context: ParserContext): Promise<void>
}

class RealtimeDataParser {
  private strategies: DataParseStrategy[] = []

  constructor() {
    // 注册默认策略
    this.registerStrategy(new DefaultLogStrategy())
  }

  /**
   * 注册新的解析策略
   */
  registerStrategy(strategy: DataParseStrategy): void {
    this.strategies.push(strategy)
    // 按优先级降序排序
    this.strategies.sort((a, b) => b.priority - a.priority)
  }

  /**
   * 处理接收到的数据
   */
  async process(data: string, context: ParserContext): Promise<void> {
    let handled = false
    for (const strategy of this.strategies) {
      if (strategy.match(data)) {
        try {
          console.debug(`[RealtimeDataParser] Strategy '${strategy.name}' matched.`)
          await strategy.handle(data, context)
          handled = true
          // 如果只需要第一个匹配的策略处理，可以在这里 break
          // 目前设计为责任链模式，可以多个策略处理同一条数据（视需求而定，这里假设只匹配一个）
          break
        } catch (error) {
          console.error(`[RealtimeDataParser] Error in strategy '${strategy.name}':`, error)
        }
      }
    }

    if (!handled) {
      console.warn('[RealtimeDataParser] No strategy matched for data:', data)
    }
  }
}

// --- 默认策略示例 ---

/**
 * 默认策略：仅打印日志
 */
class DefaultLogStrategy implements DataParseStrategy {
  name = 'DefaultLogger'
  priority = 0 // 最低优先级，作为兜底

  match(): boolean {
    return true // 总是匹配
  }

  async handle(data: string, context: ParserContext): Promise<void> {
    const { fish } = context
    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`

    console.log(`[${timeStr}][Fish-${fish.id}] 收到数据:`, data)

    // 这里可以处理通用入库逻辑，或者仅作为调试输出
    // 实际业务逻辑建议在更高优先级的策略中实现
  }
}

// --- 示例扩展策略 ---

/**
 * 示例：GPS数据解析策略
 * 假设数据格式为: $GPS,lat,lon,battery
 */
export class GpsDataStrategy implements DataParseStrategy {
  name = 'GpsParser'
  priority = 10

  match(data: string): boolean {
    return data.startsWith('$GPS')
  }

  async handle(data: string, context: ParserContext): Promise<void> {
    try {
      // 移除前缀并分割
      const parts = data.replace('$GPS,', '').split(',')
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0])
        const lon = parseFloat(parts[1])
        const battery = parts.length > 2 ? parseFloat(parts[2]) : null

        // 调用主进程API入库
        await window.api.history.create({
          time: new Date().toISOString(),
          content: data,
          lat,
          lon,
          battery,
          // 可以根据需要填充其他字段
        })
        console.log('GPS data saved for fish:', context.fish.name)
      }
    } catch (e) {
      console.error('Failed to parse GPS data:', e)
    }
  }
}

export class StatDataStrategy implements DataParseStrategy {
  name = 'StatParser'
  priority = 20

  match(data: string): boolean {
    return data.startsWith('STAT')
  }

  async handle(data: string, context: ParserContext): Promise<void> {
    try {
      // 格式: STAT,yaw,pitch,roll,lon,lat,depth,height,signalStrength,battery,time
      // 示例: STAT,0.00,0.00,0.00,0.000000,0.000000,0.00,0.00,323,-1,2025-12-13 14:55:32
      const parts = data.split(',')
      if (parts.length >= 11) {
        const yawDeg = parseFloat(parts[1])
        const pitchDeg = parseFloat(parts[2])
        const rollDeg = parseFloat(parts[3])
        const lon = parseFloat(parts[4])
        const lat = parseFloat(parts[5])
        const depth = parseFloat(parts[6])
        const height = parseFloat(parts[7])
        const signalStrength = parseFloat(parts[8])
        const battery = parseFloat(parts[9])
        const timeStr = parts[10]

        // 入库
        await window.api.history.create({
          time: timeStr,
          content: data, // 原始内容作为元数据
          rawLine: data,
          lon,
          lat,
          depth,
          height,
          battery,
          signalStrength,
          yawDeg,
          pitchDeg,
          rollDeg
        })
        console.log(`[StatParser] Parsed and saved for fish ${context.fish.id}`)
      } else {
        console.warn('[StatParser] Invalid format:', data)
      }
    } catch (e) {
      console.error('[StatParser] Failed to parse STAT data:', e)
    }
  }
}

// 导出单例实例
export const realtimeDataParser = new RealtimeDataParser()
// 注册示例策略（实际使用时可以按需注册）
realtimeDataParser.registerStrategy(new GpsDataStrategy())
realtimeDataParser.registerStrategy(new StatDataStrategy())
