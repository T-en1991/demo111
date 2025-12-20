import { Fish } from '../store/fishControl'
import { FISH_STATUS_CONFIG } from '../config'

// Shared state for USBL data merging
let lastUsblData: {
  east: number
  north: number
  rawLine: string
  time: number
} | null = null

// Shared state for throttling (fishId -> timestamp)
const lastProcessedTime = new Map<number, number>()

export interface FishTelemetry {
  yaw?: number
  pitch?: number
  roll?: number
  depth?: number
  altitude?: number
  battery?: number
  acoustic?: 'strong' | 'medium' | 'weak'
  lng?: number
  lat?: number
  lastUpdated?: number
  label?: string // 中文状态描述，如 "正在上浮"
}

export interface ParserContext {
  fish: Fish
  ip: string
  port: number
  updateStatus?: (status: Partial<FishTelemetry>) => void
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
          // console.debug(`[RealtimeDataParser] Strategy '${strategy.name}' matched.`)
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

/**
 * USBL数据解析策略
 * 解析 USBLLONG 数据并缓存，供 STAT 数据合并使用
 */
export class UsblDataStrategy implements DataParseStrategy {
  name = 'UsblParser'
  priority = 25 // 比 STAT 优先级高，或者独立匹配

  match(data: string): boolean {
    return data.includes('USBLLONG')
  }

  async handle(data: string, _context: ParserContext): Promise<void> {
    void _context // 避免未使用的变量报错
    try {
      // 1. 过滤重复数据：如果在短时间内（如1秒）已经收到过 USBL 数据，则忽略后续的（取第一条）
      if (lastUsblData && (Date.now() - lastUsblData.time < 2000)) {
        return
      }

      // 示例: +++AT:132:USBLLONG,1325384364.662679,1325384364.401149,2,0.0234,0.3407,-0.1417,-0.3286,0.0800,-0.1494,-0.0178,0.1164,1.3498,247,-16,388,0.0116
      // 索引 7 为运动补偿后的东向坐标 (East)，索引 8 为运动补偿后的北向坐标 (North)
      const parts = data.split(',')
      if (parts.length >= 9) {
        const east = parseFloat(parts[7])
        const north = parseFloat(parts[8])
        if (!isNaN(east) && !isNaN(north)) {
          lastUsblData = {
            east,
            north,
            rawLine: data,
            time: Date.now()
          }
          console.log('[UsblParser] Cached USBL data:', { east, north })
        }
      }
    } catch (e) {
      console.error('[UsblParser] Failed to parse USBL data:', e)
    }
  }
}

export class StatusStringStrategy implements DataParseStrategy {
  name = 'StatusStringParser'
  priority = 15 // Check before fallback but after specific formats

  match(data: string): boolean {
    // Only match if it's a known status keyword
    const upper = data.toUpperCase().trim()
    return FISH_STATUS_CONFIG.some(cfg => upper.includes(cfg.keyword))
  }

  async handle(data: string, context: ParserContext): Promise<void> {
    const upper = data.toUpperCase().trim()
    const match = FISH_STATUS_CONFIG.find(cfg => upper.includes(cfg.keyword))
    if (match) {
      console.log(`[StatusStringParser] Matched status: ${match.status} (${match.label})`)
      if (context.updateStatus) {
        context.updateStatus({ label: match.label, lastUpdated: Date.now() })
      }
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
      const { fish } = context

      // 时间过滤：检查距离上次处理是否超过 3000ms
      const now = Date.now()
      const lastTime = lastProcessedTime.get(fish.id) || 0
      if (now - lastTime < 3000) {
        return // 忽略频繁数据
      }
      lastProcessedTime.set(fish.id, now)

      // 2. 等待 2000ms，以确保如果 USBL 数据稍晚到达也能被捕获（整合数据）
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // 格式: STAT,yaw,pitch,roll,lon,lat,depth,height,signalStrength,battery,time
      // 示例: STAT,0.00,0.00,0.00,0.000000,0.000000,0.00,0.00,323,-1,2025-12-13 14:55:32
      const parts = data.split(',')
      if (parts.length >= 11) {
        const yawDeg = parseFloat(parts[1])
        const pitchDeg = parseFloat(parts[2])
        const rollDeg = parseFloat(parts[3])
        let lon = parseFloat(parts[4])
        let lat = parseFloat(parts[5])
        const depth = parseFloat(parts[6])
        const height = parseFloat(parts[7])
        const signalStrength = parseFloat(parts[8])
        const battery = parseFloat(parts[9])
        const timeStr = parts[10]

        let usblRawLine: string | null = null

        // 如果有缓存的 USBL 数据且足够新鲜（例如 5秒内），则计算真实经纬度
        // 并将 USBL 原始数据存入 content 字段
        if (lastUsblData && (now - lastUsblData.time < 5000)) {
          // 确保鱼配置中有声通基准坐标
          console.log(fish.acousticLon , fish.acousticLat,11111)
          if (fish.acousticLon && fish.acousticLat) {
             const R_EARTH = 6378137
             const dLat = lastUsblData.north / R_EARTH
             const dLon = lastUsblData.east / (R_EARTH * Math.cos(fish.acousticLat * Math.PI / 180))

             lat = fish.acousticLat + (dLat * 180 / Math.PI)
             lon = fish.acousticLon + (dLon * 180 / Math.PI)

             usblRawLine = lastUsblData.rawLine
          }
        }

        // 更新实时状态到状态管理
        if (context.updateStatus) {
          context.updateStatus({
            yaw: yawDeg,
            pitch: pitchDeg,
            roll: rollDeg,
            depth,
            altitude: height,
            battery,
            acoustic: signalStrength > -80 ? 'strong' : signalStrength > -100 ? 'medium' : 'weak',
            lng: lon,
            lat,
            lastUpdated: Date.now()
          })
        }

        // 入库
        await window.api.history.create({
          time: timeStr,
          content: usblRawLine ?? undefined, // 存入 USBL 原始数据
          rawLine: data,        // 存入 STAT 原始数据
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
realtimeDataParser.registerStrategy(new UsblDataStrategy())
realtimeDataParser.registerStrategy(new StatusStringStrategy())
