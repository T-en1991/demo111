import { registerSystemIpc } from './system'
import { registerDatabaseIpc } from './database'
import { registerRtspIpc } from './rtsp'

export function registerIpc(): void {
  registerSystemIpc()
  registerDatabaseIpc()
  registerRtspIpc()
}
