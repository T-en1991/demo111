import { PrismaClient, Prisma } from '@prisma/client'
import type { User, Alert, Fish, ImageFrame } from '@prisma/client'
import logger from '../logger'
import * as XLSX from 'xlsx'
import { existsSync, copyFileSync } from 'fs'
import { extname, join } from 'path'
import { app } from 'electron'

const isDev = process.env.NODE_ENV === 'development'
const dbUrl = isDev
  ? process.env.DATABASE_URL
  : `file:${join(app.getPath('userData'), 'ocean-fish.db')}`

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  },
  log: isDev ? ['query', 'info', 'warn', 'error'] : ['error']
})

async function initTables() {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");`,
    `CREATE TABLE IF NOT EXISTS "fish" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'default',
    "ip" TEXT,
    "port" INTEGER,
    "rtspUrl" TEXT,
    "rtsp2" TEXT,
    "starlinkRtspMono" TEXT,
    "starlinkRtspStereo" TEXT,
    "satcomIp" TEXT,
    "satcomPort1" INTEGER,
    "satcomPort2" INTEGER,
    "microwaveIp" TEXT,
    "microwavePort" INTEGER,
    "acousticLon" REAL,
    "acousticLat" REAL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "ascendCommand" TEXT,
    "descendCommand" TEXT,
    "forwardCommand" TEXT,
    "leftCommand" TEXT,
    "rightCommand" TEXT,
    "upCommand" TEXT,
    "downCommand" TEXT,
    "surfCommand" TEXT,
    "manualCommand" TEXT,
    "returnCommand" TEXT,
    "navigateCommand" TEXT,
    "lightOnCommand" TEXT,
    "lightOffCommand" TEXT,
    "wifiCommand" TEXT,
    "wifiOffCommand" TEXT,
    "description" TEXT,
    "track" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);`,
    `CREATE TABLE IF NOT EXISTS "alerts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "level" TEXT,
    "type" TEXT,
    "source" TEXT,
    "imgFile" TEXT,
    "lat" REAL,
    "lon" REAL,
    "fishId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromSocket" BOOLEAN NOT NULL DEFAULT true,
    "imageBase64" TEXT,
    CONSTRAINT "alerts_fishId_fkey" FOREIGN KEY ("fishId") REFERENCES "fish" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);`,
    `CREATE TABLE IF NOT EXISTS "History" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lon" REAL,
    "lat" REAL,
    "depth" REAL,
    "height" REAL,
    "battery" INTEGER,
    "signalStrength" INTEGER,
    "time" DATETIME NOT NULL
);`,
    `CREATE TABLE IF NOT EXISTS "ImageFrame" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "packetId" INTEGER NOT NULL,
    "totalPackets" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);`
  ]

  for (const sql of sqls) {
    await prisma.$executeRawUnsafe(sql)
  }
  logger.info('Database tables initialized successfully')
}

// 确保数据库连接正常
export async function connectDatabase(): Promise<void> {
  try {
    // 生产环境初始化数据库
    if (!isDev) {
      const dbPath = join(app.getPath('userData'), 'ocean-fish.db')

      // 如果数据库文件不存在，尝试从模板拷贝
      if (!existsSync(dbPath)) {
        try {
          // 模板文件路径：在打包后的 resources/prisma/template.db
          const templatePath = join(process.resourcesPath ?? '', 'prisma', 'template.db')

          if (existsSync(templatePath)) {
            logger.info(`Initializing database from template: ${templatePath}`)
            copyFileSync(templatePath, dbPath)
            logger.info('Database initialized from template successfully')
          } else {
            logger.warn(
              `Template database not found at ${templatePath}, falling back to SQL initialization`
            )
            await initTables()
          }
        } catch (e) {
          logger.error('Failed to copy database template, falling back to SQL initialization', e)
          await initTables()
        }
      }
    }

    await prisma.$connect()

    // 二次确认：检查表是否存在
    try {
      await prisma.$queryRaw`SELECT 1 FROM fish LIMIT 1`
    } catch (e) {
      logger.warn('Database connected but tables not found, executing SQL initialization...')
      await initTables()
    }

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
    if (ext !== '.xlsx' && ext !== '.xls' && ext !== '.csv') {
      throw new Error('Unsupported file extension: ' + ext)
    }
    const wb = XLSX.readFile(filePath, { cellDates: true })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
      raw: true,
      defval: null
    })
    const norm = (s: string): string => s.trim().toLowerCase()
    const mapKey = (k: string): string => {
      const s = norm(k)
      if (['utc_time', 'uct_time', 'utc time', '时间'].includes(s)) return 'time'
      if (['lon_deg', '经度'].includes(s)) return 'lon'
      if (['lat_deg', '纬度'].includes(s)) return 'lat'
      if (['depth_m', '深度'].includes(s)) return 'depth'
      if (['alt_m', '高度', 'alt', 'dvl_alt[m]'].includes(s)) return 'height'
      if (['battery_percent', '电量'].includes(s)) return 'battery'
      if (['si', '信号强度', 'signal'].includes(s)) return 'signalStrength'
      if (['content', '内容'].includes(s)) return 'content'
      if (['roll_deg', '横滚角', 'roll'].includes(s)) return 'rollDeg'
      if (['pitch_deg', '俯仰角', 'pitch'].includes(s)) return 'pitchDeg'
      if (['yaw_deg', '偏航角', '航向角', 'yaw'].includes(s)) return 'yawDeg'
      if (['raw_line', '元数据', 'raw', '原始行'].includes(s)) return 'rawLine'
      // if (['ax[m/s^2]', '角速度x', 'ax'].includes(s)) return 'axMs2'
      // if (['ay[m/s^2]', '角速度y', 'ay'].includes(s)) return 'ayMs2'
      // if (['az[m/s^2]', '角速度z', 'az'].includes(s)) return 'azMs2'
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
      let time: Date | null = null
      const makeCnDate = (
        y: number,
        mo: number,
        d: number,
        h: number,
        mi: number,
        s: number
      ): Date => new Date(Date.UTC(y, mo - 1, d, h - 8, mi, s))
      if (t instanceof Date) {
        const y = t.getFullYear()
        const mo = t.getMonth() + 1
        const d = t.getDate()
        const h = t.getHours()
        const mi = t.getMinutes()
        const s = t.getSeconds()
        time = makeCnDate(y, mo, d, h, mi, s)
      } else if (typeof t === 'string') {
        const s = t.trim()
        const m =
          /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s) ||
          /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s)
        if (m) {
          const y = Number(m[1])
          const mo = Number(m[2])
          const d = Number(m[3])
          const h = Number(m[4])
          const mi = Number(m[5])
          const sec = m[6] ? Number(m[6]) : 0
          time = makeCnDate(y, mo, d, h, mi, sec)
        } else {
          time = null
        }
      } else {
        time = null
      }
      if (!time || isNaN(time.getTime())) return null
      const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))
      return {
        time,
        content: obj.content ?? null,
        rawLine: obj.rawLine ?? null,
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
      const res = await prisma.history.createMany({ data: part as any })
      inserted += res.count
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
  // 创建历史记录（允许相同 time 多条记录）
  async create(data: {
    time: Date | string
    content?: string | null
    rawLine?: string | null
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
      rawLine: data.rawLine ?? null,
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

    const existing = await prisma.history.findFirst({ where: { time: timeValue } })
    if (existing) {
      return { inserted: 0, updated: 0, skipped: 1, record: existing }
    }
    const rec = await prisma.history.create({ data: payload })
    return { inserted: 1, updated: 0, record: rec }
  },

  // 获取历史记录列表（支持分页和时间范围）
  async list(
    params: {
      page?: number
      pageSize?: number
      startTime?: string
      endTime?: string
    } = {}
  ): Promise<{
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
    level?: string | null
    type?: string
    source?: string
    status?: 'active' | 'resolved' | 'acknowledged'
    fishId?: number | null
    imgFile?: string | null
    lat?: number | null
    lon?: number | null
    fromSocket?: boolean | null
    imageBase64?: string | null
  }): Promise<Alert> {
    return prisma.alert.create({
      data: {
        title: data.title,
        message: data.message,
        level: data.level,
        type: data.type,
        source: data.source,
        status: data.status,
        fishId: data.fishId ?? null,
        imgFile: data.imgFile ?? null,
        lat: data.lat ?? null,
        lon: data.lon ?? null,
        fromSocket: data.fromSocket ?? true,
        imageBase64: data.imageBase64 ?? null
      }
    })
  },

  // 获取所有告警
  async findAll(): Promise<Alert[]> {
    return prisma.alert.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 获取告警列表（支持分页、时间范围和fromSocket过滤）
  async list(
    params: {
      page?: number
      pageSize?: number
      startTime?: string
      endTime?: string
      fromSocket?: boolean
    } = {}
  ): Promise<{
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
    if (params.fromSocket !== undefined) {
      where.fromSocket = params.fromSocket
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
  async findByLevel(level: string): Promise<Alert[]> {
    return prisma.alert.findMany({
      where: { level },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据文件名查找告警
  async findByFilename(filename: string): Promise<Alert | null> {
    // 尝试直接匹配 imgFile，或者 imgFile 包含 filename
    // 优先完整匹配
    let alert = await prisma.alert.findFirst({
      where: {
        OR: [{ imgFile: filename }, { imgFile: { contains: filename } }]
      },
      orderBy: { createdAt: 'desc' }
    })
    return alert
  },

  // 根据ID查找告警
  async findById(id: number): Promise<Alert | null> {
    return prisma.alert.findUnique({
      where: { id }
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
  },

  // 更新告警
  async update(
    id: number,
    data: {
      title?: string
      message?: string | null
      level?: string | null
      type?: string | null
      source?: string | null
      imgFile?: string | null
      lat?: number | null
      lon?: number | null
      fishId?: number | null
      status?: 'active' | 'resolved' | 'acknowledged'
      imageBase64?: string | null
    }
  ): Promise<Alert> {
    return prisma.alert.update({
      where: { id },
      data
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
    starlinkRtspMono?: string | null
    starlinkRtspStereo?: string | null
    satcomIp?: string | null
    satcomPort1?: number | null
    satcomPort2?: number | null
    microwaveIp?: string | null
    microwavePort?: number | null
    acousticLon?: number | null
    acousticLat?: number | null
    type?: string
    status?: 'running' | 'stopped'
    ascendCommand?: string | null
    descendCommand?: string | null
    forwardCommand?: string | null
    leftCommand?: string | null
    rightCommand?: string | null
    manualCommand?: string | null
    returnCommand?: string | null
    upCommand?: string | null
    downCommand?: string | null
    surfCommand?: string | null
    navigateCommand?: string | null
    lightOnCommand?: string | null
    lightOffCommand?: string | null
    wifiCommand?: string | null
    wifiOffCommand?: string | null
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
      starlinkRtspMono: data.starlinkRtspMono ?? null,
      starlinkRtspStereo: data.starlinkRtspStereo ?? null,
      satcomIp: data.satcomIp ?? null,
      satcomPort1: data.satcomPort1 ?? null,
      satcomPort2: data.satcomPort2 ?? null,
      microwaveIp: data.microwaveIp ?? null,
      microwavePort: data.microwavePort ?? null,
      acousticLon: data.acousticLon ?? null,
      acousticLat: data.acousticLat ?? null,
      ascendCommand: data.ascendCommand ?? null,
      descendCommand: data.descendCommand ?? null,
      forwardCommand: data.forwardCommand ?? null,
      leftCommand: data.leftCommand ?? null,
      rightCommand: data.rightCommand ?? null,
      manualCommand: data.manualCommand ?? null,
      returnCommand: data.returnCommand ?? null,
      upCommand: data.upCommand ?? null,
      downCommand: data.downCommand ?? null,
      surfCommand: data.surfCommand ?? null,
      navigateCommand: data.navigateCommand ?? null,
      lightOnCommand: data.lightOnCommand ?? null,
      lightOffCommand: data.lightOffCommand ?? null,
      wifiCommand: data.wifiCommand ?? null,
      wifiOffCommand: data.wifiOffCommand ?? null,
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
      starlinkRtspMono?: string | null
      starlinkRtspStereo?: string | null
      satcomIp?: string | null
      satcomPort1?: number | null
      satcomPort2?: number | null
      microwaveIp?: string | null
      microwavePort?: number | null
      acousticLon?: number | null
      acousticLat?: number | null
      type?: string
      status?: 'running' | 'stopped'
      ascendCommand?: string | null
      descendCommand?: string | null
      forwardCommand?: string | null
      leftCommand?: string | null
      rightCommand?: string | null
      manualCommand?: string | null
      returnCommand?: string | null
      upCommand?: string | null
      downCommand?: string | null
      surfCommand?: string | null
      navigateCommand?: string | null
      lightOnCommand?: string | null
      lightOffCommand?: string | null
      wifiCommand?: string | null
      wifiOffCommand?: string | null
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
    endedAt?: Date | string | null
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
            : data.recordedAt,
      endedAt:
        data.endedAt == null
          ? data.recordedAt == null
            ? null
            : typeof data.recordedAt === 'string'
              ? new Date(new Date(data.recordedAt).getTime() + 10 * 60 * 1000)
              : new Date((data.recordedAt as Date).getTime() + 10 * 60 * 1000)
          : typeof data.endedAt === 'string'
            ? new Date(data.endedAt)
            : data.endedAt
    }
    // Try to find existing record by path. Use findFirst to avoid requiring a unique index on `path`.
    // If found, update the existing record; otherwise create a new one.
    const existing = await prisma.video.findFirst({ where: { path: data.path } as any })
    if (existing && (existing as any).id) {
      const rec = await prisma.video.update({
        where: { id: (existing as any).id },
        data: payload as any
      })
      return { inserted: 0, updated: 1, record: rec }
    }

    // @ts-ignore: Video model not recognized by client yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = await prisma.video.create({ data: payload as any })
    return { inserted: 1, updated: 0, record: rec }
  },
  async findByMoment(moment: Date | string): Promise<{ mono: any | null; stereo: any | null }> {
    const t = typeof moment === 'string' ? new Date(moment) : moment
    const whereBase: any = {
      recordedAt: { lte: t }
    }
    const intervalFilter: any = {
      OR: [{ endedAt: null }, { endedAt: { gte: t } }]
    }
    const [mono, stereo] = await Promise.all([
      // @ts-ignore: Video model not recognized by client yet
      prisma.video.findFirst({
        where: { ...whereBase, ...intervalFilter, camera: 'mono' } as any,
        orderBy: { recordedAt: 'desc' } as any
      }),
      // @ts-ignore: Video model not recognized by client yet
      prisma.video.findFirst({
        where: { ...whereBase, ...intervalFilter, camera: 'stereo' } as any,
        orderBy: { recordedAt: 'desc' } as any
      })
    ])
    return { mono, stereo }
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

export const imageFrameService = {
  // Save a new frame
  async create(data: {
    imageId: string
    current: number
    total: number
    data: string
    crc?: string
    filename?: string
  }): Promise<ImageFrame> {
    // Check if frame exists
    const existing = await prisma.imageFrame.findFirst({
      where: {
        imageId: data.imageId,
        current: data.current
      }
    })

    if (existing) {
      // Update existing
      return prisma.imageFrame.update({
        where: { id: existing.id },
        data: {
          total: data.total,
          data: data.data,
          crc: data.crc ?? null,
          filename: data.filename ?? null
        }
      })
    }

    // Create new
    return prisma.imageFrame.create({
      data: {
        imageId: data.imageId,
        current: data.current,
        total: data.total,
        data: data.data,
        crc: data.crc ?? null,
        filename: data.filename ?? null
      }
    })
  },

  // Count frames collected for a specific imageId
  async countFrames(imageId: string): Promise<number> {
    // Current is distinct frame index. We count how many unique 'current' indices we have.
    // However, logic implies 1 record per frame.
    // To refer to unique frames, we can use distinct or just count if we trust logic doesn't duplicate much.
    // Ideally we should use findMany distinct.
    const frames = await prisma.imageFrame.findMany({
      where: { imageId },
      select: { current: true },
      distinct: ['current']
    })
    return frames.length
  },

  // Get all frames for an imageId, ordered by index
  async getFrames(imageId: string): Promise<ImageFrame[]> {
    return prisma.imageFrame.findMany({
      where: { imageId },
      orderBy: { current: 'asc' }
    })
  },

  // Get progress info (current unique count / total)
  // Logic: query one record to get 'total' (since total is consistent for same imageId), then count unique frames.
  async getProgress(
    imageId: string
  ): Promise<{ collected: number; total: number; filename: string | null }> {
    const sample = await prisma.imageFrame.findFirst({ where: { imageId } })
    if (!sample) return { collected: 0, total: 0, filename: null }
    const collected = await this.countFrames(imageId)
    return { collected, total: sample.total, filename: sample.filename }
  }
}

export const systemLogService = {
  async create(data: { content: string; type: string; time?: Date | string }) {
    return prisma.systemLog.create({
      data: {
        content: data.content,
        type: data.type,
        time: data.time ? new Date(data.time) : new Date()
      }
    })
  },

  async list(
    params: {
      page?: number
      pageSize?: number
      startTime?: string
      endTime?: string
      type?: string
    } = {}
  ) {
    const { page = 1, pageSize = 20, startTime, endTime, type } = params
    const skip = (page - 1) * pageSize
    const where: Prisma.SystemLogWhereInput = {}

    if (startTime && endTime) {
      where.time = {
        gte: new Date(startTime),
        lte: new Date(endTime)
      }
    } else if (startTime) {
      where.time = { gte: new Date(startTime) }
    } else if (endTime) {
      where.time = { lte: new Date(endTime) }
    }

    if (type) {
      where.type = type
    }

    const [total, items] = await Promise.all([
      prisma.systemLog.count({ where }),
      prisma.systemLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { time: 'desc' }
      })
    ])

    return { items, total, page, pageSize }
  },

  async clear() {
    return prisma.systemLog.deleteMany()
  }
}
