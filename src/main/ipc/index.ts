import { registerSystemIpc } from './system'
import { registerDatabaseIpc } from './database'
import { registerRtspIpc } from './rtsp'
import { registerTcpIpc } from './tcp'

export function registerIpc(): void {
  registerSystemIpc()
  registerDatabaseIpc()
  registerRtspIpc()
  registerTcpIpc()
}
