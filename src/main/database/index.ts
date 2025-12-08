import { PrismaClient, Prisma } from '@prisma/client'
import type { User, Alert, Fish } from '@prisma/client'
import logger from '../logger'
import * as XLSX from 'xlsx'
import { existsSync } from 'fs'
import { extname } from 'path'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
})

// 确保数据库连接正常
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect()
    logger.info('Database connected successfully')
  } catch (error) {
    logger.error('Database connection failed:', error)
    throw error
  }
}

export const importService = {
  async importHistoryFromXlsx(
    filePath: string
  ): Promise<{ inserted: number; updated: number; failed: number }> {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path')
    }
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.xlsx' && ext !== '.xls') {
      throw new Error('Unsupported file extension: ' + ext)
    }
    const wb = XLSX.readFile(filePath, { cellDates: true })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { raw: false })
    const norm = (s: string): string => s.trim().toLowerCase()
    const mapKey = (k: string): string => {
      const s = norm(k)
      if (['time_wall', '时间'].includes(s)) return 'time'
      if (['fused_lon', '经度'].includes(s)) return 'lon'
      if (['fused_lat', '纬度'].includes(s)) return 'lat'
      if (['depth[m]', '深度'].includes(s)) return 'depth'
      if (['dvl_alt[m]', '高度', 'alt', 'dvl_alt[m]'].includes(s)) return 'height'
      if (['battery', '电量'].includes(s)) return 'battery'
      if (['signalstrength', '信号强度', 'signal'].includes(s)) return 'signalStrength'
      if (['content', '内容'].includes(s)) return 'content'
      if (['roll[deg]', '横滚角', 'roll'].includes(s)) return 'rollDeg'
      if (['pitch[deg]', '俯仰角', 'pitch'].includes(s)) return 'pitchDeg'
      if (['yaw[deg]', '偏航角', 'yaw'].includes(s)) return 'yawDeg'
      if (['ax[m/s^2]', '角速度x', 'ax'].includes(s)) return 'axMs2'
      if (['ay[m/s^2]', '角速度y', 'ay'].includes(s)) return 'ayMs2'
      if (['az[m/s^2]', '角速度z', 'az'].includes(s)) return 'azMs2'
      return k
    }

    let inserted = 0
    let updated = 0
    let failed = 0

    const toPayloads = rows.map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: any = {}
      Object.keys(row).forEach((k) => {
        obj[mapKey(k)] = row[k]
      })
      const t = obj.time
      const time = t instanceof Date ? t : typeof t === 'string' ? new Date(t) : null
      if (!time || isNaN(time.getTime())) return null
      const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))
      return {
        time,
        content: obj.content ?? null,
        lon: num(obj.lon),
        lat: num(obj.lat),
        depth: num(obj.depth),
        height: num(obj.height),
        battery: obj.battery == null || obj.battery === '' ? null : Number(obj.battery),
        signalStrength:
          obj.signalStrength == null || obj.signalStrength === ''
            ? null
            : Number(obj.signalStrength),
        rollDeg: num(obj.rollDeg),
        pitchDeg: num(obj.pitchDeg),
        yawDeg: num(obj.yawDeg),
        axMs2: num(obj.axMs2),
        ayMs2: num(obj.ayMs2),
        azMs2: num(obj.azMs2)
      }
    })

    const payloads = toPayloads.filter(Boolean) as Prisma.HistoryCreateInput[]
    const chunk = 500
    for (let i = 0; i < payloads.length; i += chunk) {
      const part = payloads.slice(i, i + chunk)
      // @ts-ignore: History uses time as unique key
      const ops = part.map((p) => prisma.history.findUnique({ where: { time: p.time } }))
      const exists = await prisma.$transaction(ops)
      // Use the existence check results to perform update by id or create.
      const ops2 = part.map((p, idx) => {
        const e = exists[idx]
        if (e && e.id) {
          // update by id to avoid relying on time unique where clause in generated client
          return prisma.history.update({ where: { id: e.id }, data: p })
        }
        return prisma.history.create({ data: p })
      })
      await prisma.$transaction(ops2)
      exists.forEach((e) => {
        if (e) updated++
        else inserted++
      })
    }

    failed = rows.length - (inserted + updated)
    return { inserted, updated, failed }
  }
}
// 断开数据库连接
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect()
    logger.info('Database disconnected successfully')
  } catch (error) {
    logger.error('Database disconnection failed:', error)
  }
}

// User CRUD 操作
export const userService = {
  // 创建用户
  async create(data: { email: string; name?: string }): Promise<User> {
    return prisma.user.create({ data })
  },

  // 获取所有用户
  async findAll(): Promise<User[]> {
    return prisma.user.findMany()
  },

  // 根据ID查找用户
  async findById(id: number): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } })
  },

  // 根据邮箱查找用户
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } })
  },

  // 更新用户
  async update(id: number, data: { email?: string; name?: string }): Promise<User> {
    return prisma.user.update({
      where: { id },
      data
    })
  },

  // 删除用户
  async delete(id: number): Promise<User> {
    return prisma.user.delete({
      where: { id }
    })
  }
}

// History CRUD 操作
export const historyService = {
  // 创建历史记录（如果存在则更新，否则创建）
  async create(data: {
    time: Date | string
    content?: string | null
    lon?: number | null
    lat?: number | null
    depth?: number | null
    height?: number | null
    battery?: number | null
    signalStrength?: number | null
    rollDeg?: number | null
    pitchDeg?: number | null
    yawDeg?: number | null
    axMs2?: number | null
    ayMs2?: number | null
    azMs2?: number | null
  }) {
    const timeValue = typeof data.time === 'string' ? new Date(data.time) : data.time
    const payload = {
      time: timeValue,
      content: data.content ?? null,
      lon: data.lon ?? null,
      lat: data.lat ?? null,
      depth: data.depth ?? null,
      height: data.height ?? null,
      battery: data.battery ?? null,
      signalStrength: data.signalStrength ?? null,
      rollDeg: data.rollDeg ?? null,
      pitchDeg: data.pitchDeg ?? null,
      yawDeg: data.yawDeg ?? null,
      axMs2: data.axMs2 ?? null,
      ayMs2: data.ayMs2 ?? null,
      azMs2: data.azMs2 ?? null
    }

    // First check existence by unique time key
    // @ts-ignore - Prisma History model typing
    const existing = await prisma.history.findUnique({ where: { time: timeValue } })
    if (existing) {
      // update
      const rec = await prisma.history.update({ where: { time: timeValue }, data: payload })
      return { inserted: 0, updated: 1, record: rec }
    }
    // create
    const rec = await prisma.history.create({ data: payload })
    return { inserted: 1, updated: 0, record: rec }
  },

  // 获取历史记录列表（支持分页和时间范围）
  async list(params: {
    page?: number
    pageSize?: number
    startTime?: string
    endTime?: string
  } = {}): Promise<{
    items: any[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 10))
    const skip = (page - 1) * pageSize

    const where: any = {}
    if (params.startTime) {
      where.time = {
        ...where.time,
        gte: new Date(params.startTime)
      }
    }
    if (params.endTime) {
      where.time = {
        ...where.time,
        lte: new Date(params.endTime)
      }
    }

    const [items, total] = await Promise.all([
      prisma.history.findMany({
        where,
        orderBy: {
          time: 'desc'
        },
        skip,
        take: pageSize
      }),
      prisma.history.count({ where })
    ])

    return {
      items,
      total,
      page,
      pageSize
    }
  }
}

// Alert CRUD 操作
export const alertService = {
  // 创建告警
  async create(data: {
    title: string
    message?: string
    level?: 'info' | 'warning' | 'error' | 'critical'
    type?: string
    source?: string
    status?: 'active' | 'resolved' | 'acknowledged'
    fishId?: number | null
    imgFile?: string | null
    lat?: number | null
    lon?: number | null
  }): Promise<Alert> {
    return prisma.alert.create({ data })
  },

  // 获取所有告警
  async findAll(): Promise<Alert[]> {
    return prisma.alert.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 获取告警列表（支持分页和时间范围）
  async list(params: {
    page?: number
    pageSize?: number
    startTime?: string
    endTime?: string
  } = {}): Promise<{
    items: any[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.max(1, Math.min(100, Number(params.pageSize) || 10))
    const skip = (page - 1) * pageSize

    const where: any = {}
    if (params.startTime) {
      where.createdAt = {
        ...where.createdAt,
        gte: new Date(params.startTime)
      }
    }
    if (params.endTime) {
      where.createdAt = {
        ...where.createdAt,
        lte: new Date(params.endTime)
      }
    }

    const [items, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: pageSize
      }),
      prisma.alert.count({ where })
    ])

    return {
      items,
      total,
      page,
      pageSize
    }
  },

  // 获取活跃告警
  async findActive(): Promise<Alert[]> {
    return prisma.alert.findMany({
      where: { status: 'active' },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据级别获取告警
  async findByLevel(level: 'info' | 'warning' | 'error' | 'critical'): Promise<Alert[]> {
    return prisma.alert.findMany({
      where: { level },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据ID查找告警
  async findById(id: number): Promise<Alert | null> {
    return prisma.alert.findUnique({
      where: { id }
    })
  },

  // 更新告警
  async update(
    id: number,
    data: {
      title?: string
      message?: string
      level?: 'info' | 'warning' | 'error' | 'critical'
      type?: string
      source?: string
      status?: 'active' | 'resolved' | 'acknowledged'
    }
  ): Promise<Alert> {
    return prisma.alert.update({
      where: { id },
      data
    })
  },

  // 解决告警
  async resolve(id: number): Promise<Alert> {
    return prisma.alert.update({
      where: { id },
      data: {
        status: 'resolved'
      }
    })
  },

  // 确认告警
  async acknowledge(id: number): Promise<Alert> {
    return prisma.alert.update({
      where: { id },
      data: {
        status: 'acknowledged'
      }
    })
  },

  // 删除告警
  async delete(id: number): Promise<Alert> {
    return prisma.alert.delete({
      where: { id }
    })
  },

  // 批量删除已解决的告警
  async deleteResolved(): Promise<Prisma.BatchPayload> {
    return prisma.alert.deleteMany({
      where: { status: 'resolved' }
    })
  }
}

// Fish CRUD 操作
export const fishService = {
  // 创建机器鱼
  async create(data: {
    name: string
    ip?: string | null
    port?: number | null
    rtspUrl?: string | null
    rtsp2?: string | null
    satcomIp?: string | null
    satcomPort1?: number | null
    satcomPort2?: number | null
    microwaveIp?: string | null
    microwavePort?: number | null
    type?: string
    status?: 'running' | 'stopped'
    ascendCommand?: string | null
    descendCommand?: string | null
    forwardCommand?: string | null
    leftCommand?: string | null
    rightCommand?: string | null
    manualCommand?: string | null
    returnCommand?: string | null
    description?: string | null
    track?: Prisma.JsonValue | null
  }): Promise<Fish> {
    const payload = {
      name: data.name,
      type: data.type ?? 'default',
      status: data.status ?? 'stopped',
      ip: data.ip ?? null,
      port: data.port ?? null,
      rtspUrl: data.rtspUrl ?? null,
      rtsp2: data.rtsp2 ?? null,
      satcomIp: data.satcomIp ?? null,
      satcomPort1: data.satcomPort1 ?? null,
      satcomPort2: data.satcomPort2 ?? null,
      microwaveIp: data.microwaveIp ?? null,
      microwavePort: data.microwavePort ?? null,
      ascendCommand: data.ascendCommand ?? null,
      descendCommand: data.descendCommand ?? null,
      forwardCommand: data.forwardCommand ?? null,
      leftCommand: data.leftCommand ?? null,
      rightCommand: data.rightCommand ?? null,
      manualCommand: data.manualCommand ?? null,
      returnCommand: data.returnCommand ?? null,
      description: data.description ?? null,
      track:
        data.track === undefined
          ? undefined
          : data.track === null
            ? Prisma.DbNull
            : (data.track as Prisma.InputJsonValue)
    }
    return prisma.fish.create({ data: payload })
  },

  // 获取所有机器鱼
  async findAll(): Promise<Fish[]> {
    return prisma.fish.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据ID查找机器鱼
  async findById(id: number): Promise<Fish | null> {
    return prisma.fish.findUnique({
      where: { id }
    })
  },

  // 根据状态获取机器鱼
  async findByStatus(status: 'running' | 'stopped'): Promise<Fish[]> {
    return prisma.fish.findMany({
      where: { status },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据类型获取机器鱼
  async findByType(type: string): Promise<Fish[]> {
    return prisma.fish.findMany({
      where: { type },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 搜索机器鱼（按名称模糊查询）
  async search(query: {
    name?: string
    type?: string
    status?: 'running' | 'stopped'
  }): Promise<Fish[]> {
    const where: Prisma.FishWhereInput = {}

    if (query.name) {
      where.name = {
        contains: query.name
      }
    }

    if (query.type) {
      where.type = query.type
    }

    if (query.status) {
      where.status = query.status
    }

    return prisma.fish.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 更新机器鱼
  async update(
    id: number,
    data: {
      name?: string
      ip?: string | null
      port?: number | null
      rtspUrl?: string | null
      rtsp2?: string | null
      satcomIp?: string | null
      satcomPort1?: number | null
      satcomPort2?: number | null
      microwaveIp?: string | null
      microwavePort?: number | null
      type?: string
      status?: 'running' | 'stopped'
      ascendCommand?: string | null
      descendCommand?: string | null
      forwardCommand?: string | null
      leftCommand?: string | null
      rightCommand?: string | null
      manualCommand?: string | null
      returnCommand?: string | null
      description?: string | null
      track?: Prisma.JsonValue | null
    }
  ): Promise<Fish> {
    const payload = {
      ...data,
      track:
        data.track === undefined
          ? undefined
          : data.track === null
            ? Prisma.DbNull
            : (data.track as Prisma.InputJsonValue)
    }
    return prisma.fish.update({
      where: { id },
      data: payload
    })
  },

  // 删除机器鱼
  async delete(id: number): Promise<Fish> {
    return prisma.fish.delete({
      where: { id }
    })
  },

  // 批量删除机器鱼
  async deleteMany(ids: number[]): Promise<Prisma.BatchPayload> {
    return prisma.fish.deleteMany({
      where: {
        id: {
          in: ids
        }
      }
    })
  },

  async seedMocks(count: number): Promise<Prisma.BatchPayload> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mocks: any[] = []
    for (let i = 0; i < count; i++) {
      mocks.push({
        name: `Mock Fish ${i + 1}`,
        ip: `192.168.1.${100 + i}`,
        status: i % 2 === 0 ? 'running' : 'stopped'
      })
    }
    return prisma.fish.createMany({ data: mocks })
  }
}

export { prisma }

export const videoService = {
  async create(data: {
    path: string
    name: string
    size?: number | null
    camera?: 'mono' | 'stereo' | 'unknown'
    recordedAt?: Date | string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<any> {
    const payload = {
      path: data.path,
      name: data.name,
      size: data.size ?? null,
      camera: data.camera ?? 'unknown',
      recordedAt:
        data.recordedAt == null
          ? null
          : typeof data.recordedAt === 'string'
            ? new Date(data.recordedAt)
            : data.recordedAt
    }
    // Try to find existing record by path. Use findFirst to avoid requiring a unique index on `path`.
    // If found, update the existing record; otherwise create a new one.
    const existing = await prisma.video.findFirst({ where: { path: data.path } as any })
    if (existing && (existing as any).id) {
      const rec = await prisma.video.update({ where: { id: (existing as any).id }, data: payload as any })
      return { inserted: 0, updated: 1, record: rec }
    }

    // @ts-ignore: Video model not recognized by client yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = await prisma.video.create({ data: payload as any })
    return { inserted: 1, updated: 0, record: rec }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async list(params: { page?: number; pageSize?: number; keyword?: string }): Promise<any> {
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = params.keyword ? { name: { contains: String(params.keyword) } } : {}
    const [items, total] = await Promise.all([
      // @ts-ignore: Video model not recognized by client yet
      prisma.video.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      // @ts-ignore: Video model not recognized by client yet
      prisma.video.count({ where })
    ])
    return { items, total, page, pageSize }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get(id: number): Promise<any> {
    // @ts-ignore: Video model not recognized by client yet
    return prisma.video.findUnique({ where: { id } })
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async delete(id: number): Promise<any> {
    // @ts-ignore: Video model not recognized by client yet
    return prisma.video.delete({ where: { id } })
  }
}
