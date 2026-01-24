import { registerSystemIpc } from './system'
import { registerDatabaseIpc } from './database'
import { registerRtspIpc } from './rtsp'
import { registerTcpIpc } from './tcp'
import { registerSerialIpc } from './serial'
import { registerAlarmIpc } from './alarm'
import { registerMediaIpc } from './media'
import { registerCommandIpc } from './command'

export function registerIpc(): void {
  registerSystemIpc()
  registerDatabaseIpc()
  registerRtspIpc()
  registerTcpIpc()
  registerSerialIpc()
  registerAlarmIpc()
  registerMediaIpc()
  registerCommandIpc()
}
