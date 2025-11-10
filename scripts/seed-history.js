/* eslint-disable @typescript-eslint/explicit-function-return-type */
// Seed script to insert 10 history records into the SQLite database
// Usage: npm run seed:history

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

    const now = new Date()
    const data = Array.from({ length: 10 }).map((_, i) => {
      const t = new Date(now)
      t.setDate(now.getDate() - Math.floor(i / 2))
      t.setHours(9 + (i % 8), 10 + i, 0, 0)

      const lats = [31.2304, 22.5431, 39.9042, 30.26, 32.0603, 29.563, 23.1291, 34.3416, 36.0611, 26.647]
      const lons = [121.4737, 114.0579, 116.4074, 120.19, 118.7969, 106.551, 113.2644, 108.9398, 103.8343, 106.653]

      const battery = [15, 82, 90, 70, 40, 55, 68, 77, 33, 88][i]
      const signal = [-68, -55, -60, -75, -80, -72, -58, -65, -85, -52][i]
      const depth = [12.3, 8.1, 0.0, 5.6, 9.7, 2.4, 6.8, 3.3, 10.2, 1.7][i]
      const height = [4.5, 3.9, 0.8, 2.2, 3.1, 1.2, 2.6, 1.8, 2.0, 1.7][i]
      const content = [
        '电池电量降至阈值',
        '姿态异常检测',
        '校准完成',
        '通信短时丢失',
        '温度超过阈值',
        '例行巡检正常',
        '导航偏差提醒',
        '水流速度偏高',
        '信号波动增大',
        '设备状态稳定'
      ][i]

      return {
        lon: lons[i],
        lat: lats[i],
        depth,
        height,
        battery,
        signalStrength: signal,
        time: t,
        content
      }
    })

    const result = await prisma.history.createMany({ data })
    console.log(`Seeded ${result.count} history records.`)
  } catch (err) {
    console.error('Seed history failed:', err)
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