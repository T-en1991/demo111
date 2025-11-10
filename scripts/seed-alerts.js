// Simple seed script to insert 2 alert records into the SQLite database
// Usage: npm run seed:alerts

/**
 * @returns {Promise<void>}
 */
async function main() {
  const { PrismaClient } = await import('@prisma/client')

  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
  })

  try {
    await prisma.$connect()

    const rows = [
      {
        title: '示例报警：电池电量低',
        message: '电池电量低于 20%',
        level: 'warning',
        type: 'battery',
        source: 'seed-script',
        status: 'active'
      },
      {
        title: '示例报警：温度过高',
        message: '核心温度超过 80℃',
        level: 'error',
        type: 'temperature',
        source: 'seed-script',
        status: 'active'
      }
    ]

    const result = await prisma.alert.createMany({ data: rows })
    console.log(`Seeded ${result.count} alert records.`)
  } catch (err) {
    console.error('Seed alerts failed:', err)
    process.exitCode = 1
  } finally {
    try {
      await prisma.$disconnect()
    } catch (e) {
      console.warn('Disconnect failed:', e)
    }
  }
}

main().catch((e) => {
  console.error('Seed script failed:', e)
  process.exitCode = 1
})