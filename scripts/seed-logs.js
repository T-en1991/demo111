const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Seeding system logs...')
  
  // Clean up existing logs if needed, or just append
  // await prisma.systemLog.deleteMany()

  const logs = []
  const now = new Date()
  
  for (let i = 0; i < 50; i++) {
    const time = new Date(now.getTime() - i * 1000 * 60 * 30) // every 30 mins
    const type = Math.random() > 0.5 ? 'send' : 'receive'
    const content = type === 'send' 
      ? `发送指令 #${i}: SET_PARAM_VALUE=${Math.floor(Math.random() * 100)}` 
      : `接收响应 #${i}: STATUS_OK`
      
    logs.push({
      time,
      type,
      content
    })
  }

  for (const log of logs) {
    await prisma.systemLog.create({ data: log })
  }

  console.log(`Seeded ${logs.length} logs.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
