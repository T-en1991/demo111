
export type SignalLevel = 'strong' | 'medium' | 'weak'

export interface RobotStatus {
  id: number
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
