import { PrismaClient, Prisma } from '@prisma/client'
import type { User, Alert, Fish } from '@prisma/client'
import logger from '../logger'

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

// Alert CRUD 操作
export const alertService = {
  // 创建告警
  async create(data: {
    title: string;
    message?: string;
    level?: 'info' | 'warning' | 'error' | 'critical';
    type?: string;
    source?: string;
    status?: 'active' | 'resolved' | 'acknowledged';
    fishId?: number | null;
    imgFile?: string | null;
    lat?: number | null;
    lon?: number | null;
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
  async update(id: number, data: {
    title?: string;
    message?: string;
    level?: 'info' | 'warning' | 'error' | 'critical';
    type?: string;
    source?: string;
    status?: 'active' | 'resolved' | 'acknowledged';
  }): Promise<Alert> {
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
    name: string;
    ip?: string | null;
    port?: number | null;
    type?: string;
    status?: 'running' | 'stopped';
    ascendCommand?: string | null;
    descendCommand?: string | null;
    forwardCommand?: string | null;
    leftCommand?: string | null;
    rightCommand?: string | null;
    manualCommand?: string | null;
    exitManualCommand?: string | null;
    returnCommand?: string | null;
    description?: string | null;
    track?: Prisma.JsonValue | null;
  }): Promise<Fish> {
    const payload = {
      name: data.name,
      type: data.type ?? 'default',
      status: data.status ?? 'stopped',
      ip: data.ip ?? null,
      port: data.port ?? null,
      ascendCommand: data.ascendCommand ?? null,
      descendCommand: data.descendCommand ?? null,
      forwardCommand: data.forwardCommand ?? null,
      leftCommand: data.leftCommand ?? null,
      rightCommand: data.rightCommand ?? null,
      manualCommand: data.manualCommand ?? null,
      exitManualCommand: data.exitManualCommand ?? null,
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
    name?: string;
    type?: string;
    status?: 'running' | 'stopped';
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
  async update(id: number, data: {
    name?: string;
    ip?: string | null;
    port?: number | null;
    type?: string;
    status?: 'running' | 'stopped';
    ascendCommand?: string | null;
    descendCommand?: string | null;
    forwardCommand?: string | null;
    leftCommand?: string | null;
    rightCommand?: string | null;
    manualCommand?: string | null;
    exitManualCommand?: string | null;
    returnCommand?: string | null;
    description?: string | null;
    track?: Prisma.JsonValue | null;
  }): Promise<Fish> {
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

  // 批量生成假数据
  async seedMocks(count: number): Promise<Prisma.BatchPayload> {
    const types = ['A-型', 'B-型', 'C-型'] as const
    const statuses = ['running', 'stopped'] as const
    const rows = Array.from({ length: count }, (_, i) => {
      const idx = i + 1
      const name = `机器人-${String(idx).padStart(3, '0')}`
      const type = types[i % types.length]
      const status = statuses[i % statuses.length]
      // 随机分配部分 IP/端口
      const hasNet = Math.random() < 0.25
      const ip = hasNet ? '0.0.0.0' : null
      const port = hasNet ? (9000 + Math.floor(Math.random() * 1000)) : null
      return { name, type, status, ip, port }
    })
    // 使用 createMany 提高插入效率
    return prisma.fish.createMany({ data: rows })
  }
}

export { prisma }