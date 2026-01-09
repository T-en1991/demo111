export const DEFAULT_MICROWAVE_PORT = 9600

export interface FishStatusMapping {
  keyword: string
  status: string
  label: string
}

export const FISH_STATUS_CONFIG: FishStatusMapping[] = [
  { keyword: 'NAVIGATE', status: 'navigation', label: 'status.navigate' },
  { keyword: 'NAVIGATE-SUCCESS', status: 'navigation-success', label: 'status.navigateSuccess' },
  { keyword: 'FORWARD', status: 'forward', label: 'status.forward' },
  { keyword: 'LEFT', status: 'left', label: 'status.left' },
  { keyword: 'RIGHT', status: 'right', label: 'status.right' },
  { keyword: 'UP', status: 'up', label: 'status.up' },
  { keyword: 'DOWN', status: 'down', label: 'status.down' },
  { keyword: 'SURF', status: 'surf', label: 'status.surf' },
  { keyword: 'DONE', status: 'done', label: 'status.dive' },
  { keyword: 'MAN', status: 'manual', label: 'status.manual' },
  { keyword: 'RETURN', status: 'return', label: 'status.return' },
  { keyword: 'LIGHTON', status: 'light-on', label: 'status.lightOn' },
  { keyword: 'LIGHTOFF', status: 'light-off', label: 'status.lightOff' },
  { keyword: 'WIFI', status: 'wifi', label: 'status.wifi' }
]

export const serial_FISH_STATUS_CONFIG: FishStatusMapping[] = [
  { keyword: 'SURF', status: 'surf', label: 'status.surfSuccess' },
  { keyword: 'NAME=', status: 'name', label: 'status.fetchImage' }
]
