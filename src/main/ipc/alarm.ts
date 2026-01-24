import { ipcMain } from 'electron'
import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import logger from '../logger'
import { alertService } from '../database'

function parseTimeFromFilename(name: string): string | null {
  const base = name.split(/[\\/]/).pop() || name
  const m1 = /(\d{8})_(\d{6})/.exec(base)
  const m2 = /(\d{8})-(\d{6})/.exec(base)
  const m = m1 || m2
  if (!m) return null
  const y = m[1].slice(0, 4)
  const mo = m[1].slice(4, 6)
  const d = m[1].slice(6, 8)
  const h = m[2].slice(0, 2)
  const mi = m[2].slice(2, 4)
  const s = m[2].slice(4, 6)
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}

// 解析报警文件内容
function parseAlarmFile(
  content: string
): Array<{
  time: string
  id: string
  c: string
  img: string
  pos: { lat: number; lon: number }
}> {
  const alarms: Array<{
    time: string
    id: string
    c: string
    img: string
    pos: { lat: number; lon: number }
  }> = []

  const lines = content.split('\n')
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // 解析时间部分
    const timeMatch = trimmedLine.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+/)
    if (!timeMatch) continue

    const time = timeMatch[1]
    const rest = trimmedLine.slice(timeMatch[0].length)

    // 解析参数部分
    const params: Record<string, string> = {}
    const paramMatches = rest.matchAll(/(\w+)=(.+?)(?:;|$)/g)
    for (const match of paramMatches) {
      params[match[1]] = match[2]
    }

    if (!params.ID || !params.C || !params.IMG || !params.POS) continue

    // 解析位置
    const posParts = params.POS.split(',').map((p) => parseFloat(p.trim()))
    if (posParts.length !== 2 || isNaN(posParts[0]) || isNaN(posParts[1])) continue

    alarms.push({
      time,
      id: params.ID,
      c: params.C,
      img: params.IMG,
      pos: { lat: posParts[0], lon: posParts[1] }
    })
  }

  return alarms
}

// 检查图片文件是否存在
function checkImageExists(baseDir: string, imgName: string): boolean {
  return existsSync(join(baseDir, imgName))
}

// 查找或创建报警记录
async function findOrCreateAlert(alarmData: {
  time: string
  id: string
  c: string
  img: string
  pos: { lat: number; lon: number }
  fileName: string
  filePath: string
  fishId?: number
}): Promise<{ ok: boolean; updated: boolean }> {
  try {
    // 这里需要根据时间和报警文件作为判断条件，检查是否已存在相同的报警记录
    // 由于目前没有 findByTimeAndFile 方法，我们先获取所有记录并手动过滤
    const allAlerts = await alertService.findAll()
    const baseDir = dirname(alarmData.filePath)
    var filePath = checkImageExists(baseDir, alarmData.img) ? join(baseDir, alarmData.img) : null // 存储完整的图片文件路径
    const existingAlert = allAlerts.find((alert) => {
      // 简化判断：根据时间和图片文件名查找
      return (
        alert.imgFile == filePath
        // alert.message?.includes(alarmData.img) &&
        // alert.createdAt?.toISOString().includes(alarmData.time.split(' ')[0])
      )
    })

    const titleFromImg = parseTimeFromFilename(alarmData.img)

    const alertPayload = {
      title: titleFromImg || `报警记录 - ${alarmData.id}`,
      message: `ID=${alarmData.id};C=${alarmData.c};IMG=${alarmData.img};POS=${alarmData.pos.lat},${alarmData.pos.lon}`,
      level: alarmData.c || '',
      type: 'alarm',
      source: alarmData.filePath,
      status: 'active' as const,
      imgFile: filePath,
      lat: alarmData.pos.lat,
      lon: alarmData.pos.lon,
      fishId: alarmData.fishId ?? null
    }

    if (existingAlert) {
      // 更新现有记录
      await alertService.update(existingAlert.id, alertPayload)
      return { ok: true, updated: true }
    } else {
      // 创建新记录
      await alertService.create(alertPayload)
      return { ok: true, updated: false }
    }
  } catch (error) {
    logger.error('Failed to find or create alert:', error)
    return { ok: false, updated: false }
  }
}

export function registerAlarmIpc(): void {
  // 列出文件夹中的报警文件
  ipcMain.handle('alarm:listFiles', async (_, folderPath: string) => {
    try {
      const result: Array<{ name: string }> = []
      const stack: string[] = [folderPath]
      while (stack.length) {
        const dir = stack.pop() as string
        const entries = readdirSync(dir)
        for (const name of entries) {
          const p = join(dir, name)
          const st = statSync(p)
          if (st.isDirectory()) {
            stack.push(p)
          } else if (st.isFile() && name.toLowerCase().endsWith('.txt')) {
            result.push({ name: p })
          }
        }
      }
      return result
    } catch (error) {
      logger.error('Failed to list alarm files:', error)
      return []
    }
  })

  // 导入文件夹中的报警数据
  ipcMain.handle('alarm:importFolder', async (_, folderPath: string, fishId?: number) => {
    try {
      let ok = 0
      let fail = 0
      let updated = 0

      const alarmTxtFiles: string[] = []
      const stack: string[] = [folderPath]
      while (stack.length) {
        const dir = stack.pop() as string
        const entries = readdirSync(dir)
        for (const name of entries) {
          const p = join(dir, name)
          const st = statSync(p)
          if (st.isDirectory()) {
            stack.push(p)
          } else if (st.isFile() && name.toLowerCase().endsWith('.txt')) {
            alarmTxtFiles.push(p)
          }
        }
      }

      for (const filePath of alarmTxtFiles) {
        const fileName = filePath.split(/[\\/]/).pop() as string
        const content = readFileSync(filePath, 'utf8')
        const alarms = parseAlarmFile(content)

        for (const alarm of alarms) {
          const result = await findOrCreateAlert({
            ...alarm,
            fileName,
            filePath,
            fishId
          })

          if (result.ok) {
            ok++
            if (result.updated) {
              updated++
            }
          } else {
            fail++
          }
        }
      }

      return { ok, fail, updated }
    } catch (error) {
      logger.error('Failed to import alarm folder:', error)
      return { ok: 0, fail: 1, updated: 0 }
    }
  })
}
