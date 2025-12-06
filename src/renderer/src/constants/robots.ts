
export type SignalLevel = 'strong' | 'medium' | 'weak'

export interface RobotStatus {
  id: string
  name: string
  battery: number // %
  depth: number // m
  altitude: number // m
  yaw: number // °
  pitch: number // °
  roll: number // °
  lng: number
  lat: number
  acoustic: SignalLevel
}

export const INITIAL_ROBOTS: RobotStatus[] = [
  {
    id: 'A1',
    name: '鲸鲨01号',
    battery: 98,
    depth: 100,
    altitude: 5,
    yaw: 260,
    pitch: 15,
    roll: 2,
    lng: 53.573275,
    lat: 24.281445,
    acoustic: 'strong'
  },
  {
    id: 'B2',
    name: '鲸鲨02号',
    battery: 86,
    depth: 80,
    altitude: 8,
    yaw: 120,
    pitch: 8,
    roll: 5,
    lng: 121.4737,
    lat: 31.2304,
    acoustic: 'medium'
  },
  {
    id: 'C3',
    name: '鲸鲨03号',
    battery: 72,
    depth: 60,
    altitude: 3,
    yaw: 45,
    pitch: 12,
    roll: 3,
    lng: 113.2644,
    lat: 23.1291,
    acoustic: 'weak'
  }
]
