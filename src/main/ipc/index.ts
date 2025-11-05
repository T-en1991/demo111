import { registerSystemIpc } from './system'
import { registerDatabaseIpc } from './database'

export function registerIpc(): void {
  registerSystemIpc()
  registerDatabaseIpc()
}