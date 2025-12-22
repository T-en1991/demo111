export const DEFAULT_MICROWAVE_PORT = 9600

export interface FishStatusMapping {
  keyword: string
  status: string
  label: string
}

export const FISH_STATUS_CONFIG: FishStatusMapping[] = [
    { keyword: 'NAVIGATE', status: 'navigation', label: '导航模式中' },
  { keyword: 'NAVIGATE-SUCCESS', status: 'navigation-success', label: '导航模式' },
  { keyword: 'FORWARD', status: 'forward', label: '向前' },
  { keyword: 'LEFT', status: 'left', label: '向左' },
  { keyword: 'RIGHT', status: 'right', label: '向右' },
  { keyword: 'UP', status: 'up', label: '向上' },
  { keyword: 'DOWN', status: 'down', label: '向下' },
  { keyword: 'SURF', status: 'surf', label: '上浮' },
  { keyword: 'DONE', status: 'done', label: '下潜' },
  { keyword: 'MAN', status: 'manual', label: '人工模式' },
  { keyword: 'RETURN', status: 'return', label: '返航' },
  { keyword: 'LIGHTON', status: 'light-on', label: '灯光开启' },
  { keyword: 'LIGHTOFF', status: 'light-off', label: '灯光关闭' },
  { keyword: 'WIFI', status: 'wifi', label: 'WIFI模式' }
]

export const serial_FISH_STATUS_CONFIG: FishStatusMapping[] = [
  { keyword: 'SURF', status: 'surf', label: '上浮成功' },
  { keyword: 'NAME=', status: 'name', label: '获取图片' }
]
