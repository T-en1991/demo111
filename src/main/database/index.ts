import { PrismaClient } from '@prisma/client'
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
  async create(data: { email: string; name?: string }): Promise<any> {
    return prisma.user.create({ data })
  },

  // 获取所有用户
  async findAll(): Promise<any[]> {
    return prisma.user.findMany({
      include: {
        alerts: true
      }
    })
  },

  // 根据ID查找用户
  async findById(id: number): Promise<any | null> {
    return prisma.user.findUnique({
      where: { id },
      include: {
        alerts: true
      }
    })
  },

  // 根据邮箱查找用户
  async findByEmail(email: string): Promise<any | null> {
    return prisma.user.findUnique({
      where: { email },
      include: {
        alerts: true
      }
    })
  },

  // 更新用户
  async update(id: number, data: { email?: string; name?: string }): Promise<any> {
    return prisma.user.update({
      where: { id },
      data
    })
  },

  // 删除用户
  async delete(id: number): Promise<any> {
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
    userId?: number;
  }): Promise<any> {
    return prisma.alert.create({ data })
  },

  // 获取所有告警
  async findAll(): Promise<any[]> {
    return prisma.alert.findMany({
      include: {
        user: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 获取活跃告警
  async findActive(): Promise<any[]> {
    return prisma.alert.findMany({
      where: { status: 'active' },
      include: {
        user: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据级别获取告警
  async findByLevel(level: 'info' | 'warning' | 'error' | 'critical'): Promise<any[]> {
    return prisma.alert.findMany({
      where: { level },
      include: {
        user: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据ID查找告警
  async findById(id: number): Promise<any | null> {
    return prisma.alert.findUnique({
      where: { id },
      include: {
        user: true
      }
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
    resolvedAt?: Date;
  }): Promise<any> {
    return prisma.alert.update({
      where: { id },
      data
    })
  },

  // 解决告警
  async resolve(id: number): Promise<any> {
    return prisma.alert.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedAt: new Date()
      }
    })
  },

  // 确认告警
  async acknowledge(id: number): Promise<any> {
    return prisma.alert.update({
      where: { id },
      data: {
        status: 'acknowledged'
      }
    })
  },

  // 删除告警
  async delete(id: number): Promise<any> {
    return prisma.alert.delete({
      where: { id }
    })
  },

  // 批量删除已解决的告警
  async deleteResolved(): Promise<any> {
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
    type: string;
    status?: 'running' | 'stopped';
  }): Promise<any> {
    return prisma.fish.create({ data })
  },

  // 获取所有机器鱼
  async findAll(): Promise<any[]> {
    return prisma.fish.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据ID查找机器鱼
  async findById(id: number): Promise<any | null> {
    return prisma.fish.findUnique({
      where: { id }
    })
  },

  // 根据状态获取机器鱼
  async findByStatus(status: 'running' | 'stopped'): Promise<any[]> {
    return prisma.fish.findMany({
      where: { status },
      orderBy: {
        createdAt: 'desc'
      }
    })
  },

  // 根据类型获取机器鱼
  async findByType(type: string): Promise<any[]> {
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
  }): Promise<any[]> {
    const where: any = {}

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive'
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
    type?: string;
    status?: 'running' | 'stopped';
  }): Promise<any> {
    return prisma.fish.update({
      where: { id },
      data
    })
  },

  // 删除机器鱼
  async delete(id: number): Promise<any> {
    return prisma.fish.delete({
      where: { id }
    })
  },

  // 批量删除机器鱼
  async deleteMany(ids: number[]): Promise<any> {
    return prisma.fish.deleteMany({
      where: {
        id: {
          in: ids
        }
      }
    })
  }
}

export { prisma }