import { registerSystemIpc } from './system'
import { registerDatabaseIpc } from './database'
import { registerRtspIpc } from './rtsp'
import { registerTcpIpc } from './tcp'
import { registerSerialIpc } from './serial'

export function registerIpc(): void {
  registerSystemIpc()
  registerDatabaseIpc()
  registerRtspIpc()
  registerTcpIpc()
  registerSerialIpc()
}
