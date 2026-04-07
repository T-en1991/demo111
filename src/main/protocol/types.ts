export enum ProtocolType {
  ACOUSTIC = 'acoustic',
  IRIDIUM = 'iridium',
  UNKNOWN = 'unknown'
}

export enum AcousticCommandType {
  FORWARD = 'FORWARD',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  UP = 'UP',
  DOWN = 'DOWN',
  SURF = 'SURF',
  RETURN = 'RETURN',
  MANUAL = 'MAN',
  LPM = 'LPM', // Low Power Mode
  NAVIGATE = 'NAVIGATE',
  LIGHT_ON = 'LIGHTON',
  LIGHT_OFF = 'LIGHTOFF',
  ALARM_OK = 'ALARM-OK',
  POS = 'POS',
  WIFI = 'WIFI',
  WIFI_OFF = 'WIFIOFF',
  STOP = 'STOP',
  TARGET_POINT = 'P1', // 提供目标点
  TARGET_END = 'PE'    // 目标点结束
}

export enum IridiumCommandType {
  PIC_START = 'PICSTART',
  DONE = 'DONE' // 下潜
}

export interface AcousticEvent {
  type: 'ALARM' | 'STATUS' | 'CMD_ACK' | 'NAV_SUCCESS' | 'MAN_SUCCESS' | 'WIFI_SUCCESS' | 'WIFI_OFF_SUCCESS' | 'RETURN_SUCCESS' | 'UNKNOWN'
  raw: string
  timestamp?: number
  rssi?: number
  srcId?: string
  destId?: string
  payload?: any
}

export interface IridiumEvent {
  type: 'SURF' | 'IMAGE_CHUNK' | 'PIC_START' | 'UNKNOWN'
  raw: string
  id?: string
  timestamp?: string
  csq?: number
  data?: any
  filename?: string
}
