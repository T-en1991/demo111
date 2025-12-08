import { ipcMain } from 'electron'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import logger from '../logger'
import { alertService } from '../database'

// 解析报警文件内容
function parseAlarmFile(content: string, fileName: string): Array<{
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
    const posParts = params.POS.split(',').map(p => parseFloat(p.trim()))
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
function checkImageExists(folderPath: string, imgName: string): boolean {
  return existsSync(join(folderPath, imgName))
}

// 查找或创建报警记录
async function findOrCreateAlert(
  alarmData: {
    time: string
    id: string
    c: string
    img: string
    pos: { lat: number; lon: number }
    fileName: string
    folderPath: string
  }
): Promise<{ ok: boolean; updated: boolean }> {
  try {
    // 这里需要根据时间和报警文件作为判断条件，检查是否已存在相同的报警记录
    // 由于目前没有 findByTimeAndFile 方法，我们先获取所有记录并手动过滤
    const allAlerts = await alertService.findAll()
    const existingAlert = allAlerts.find(alert => {
      // 简化判断：根据时间和图片文件名查找
      return alert.message?.includes(alarmData.img) && 
             alert.createdAt?.toISOString().includes(alarmData.time.split(' ')[0])
    })
    
    const alertPayload = {
      title: `报警记录 - ${alarmData.id}`,
      message: `ID=${alarmData.id};C=${alarmData.c};IMG=${alarmData.img};POS=${alarmData.pos.lat},${alarmData.pos.lon}`,
      level: 'critical',
      type: 'alarm',
      source: join(alarmData.folderPath, alarmData.fileName), // 存储完整的文件路径
      status: 'active',
      imgFile: checkImageExists(alarmData.folderPath, alarmData.img) ? join(alarmData.folderPath, alarmData.img) : null, // 存储完整的图片文件路径
      lat: alarmData.pos.lat,
      lon: alarmData.pos.lon
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
      const files = readdirSync(folderPath)
      const alarmFiles = files
        .filter(file => file.startsWith('alerts_') && file.endsWith('.txt'))
        .map(file => ({
          name: file
        }))
      return alarmFiles
    } catch (error) {
      logger.error('Failed to list alarm files:', error)
      return []
    }
  })
  
  // 导入文件夹中的报警数据
  ipcMain.handle('alarm:importFolder', async (_, folderPath: string) => {
    try {
      let ok = 0
      let fail = 0
      let updated = 0
      
      const files = readdirSync(folderPath)
      const alarmTxtFiles = files.filter(file => file.startsWith('alerts_') && file.endsWith('.txt'))
      
      for (const fileName of alarmTxtFiles) {
        const filePath = join(folderPath, fileName)
        const content = readFileSync(filePath, 'utf8')
        const alarms = parseAlarmFile(content, fileName)
        
        for (const alarm of alarms) {
          const result = await findOrCreateAlert({
            ...alarm,
            fileName,
            folderPath
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