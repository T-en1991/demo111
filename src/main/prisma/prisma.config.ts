import { defineConfig, env } from 'prisma/config'
import 'dotenv/config'

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations'
  },
  engine: 'classic',
  datasource: {
    url: env('DATABASE_URL')
  }
})
