import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// 最小离线适配层，提供与当前页面使用一致的 BMap API 子集
class Point {
  lng: number
  lat: number
  constructor(lng: number, lat: number) {
    this.lng = lng
    this.lat = lat
  }
}

class Marker {
  private marker: L.Marker
  constructor(point: Point) {
    this.marker = L.marker([point.lat, point.lng])
  }
  addTo(map: L.Map): void {
    this.marker.addTo(map)
  }
}

class NavigationControl {
  addTo(map: L.Map): void {
    L.control.zoom({ position: 'topright' }).addTo(map)
  }
}

class ScaleControl {
  addTo(map: L.Map): void {
    L.control.scale({ position: 'bottomleft' }).addTo(map)
  }
}

class Map {
  private map: L.Map
  constructor(container: string | HTMLElement) {
    const el = typeof container === 'string' ? (document.getElementById(container) as HTMLElement) : container
    this.map = L.map(el, { zoomControl: false, scrollWheelZoom: false })
    // 设置深色背景，避免无瓦片时呈现默认灰色
    el.style.background = '#1e2030'
    // 尝试加载本地瓦片（如不存在则仍可使用空背景进行点位标注）
    const template = getLocalTileUrlTemplate()
    if (template) {
      try {
        L.tileLayer(template, { maxZoom: 18, minZoom: 3, crossOrigin: true }).addTo(this.map)
      } catch (err) {
        // 忽略瓦片加载错误，继续提供基础交互
        void err
      }
    }
  }
  centerAndZoom(point: Point, zoom: number): void {
    this.map.setView([point.lat, point.lng], zoom)
  }
  enableScrollWheelZoom(enable: boolean): void {
    if (enable) this.map.scrollWheelZoom.enable()
    else this.map.scrollWheelZoom.disable()
  }
  addControl(control: { addTo: (map: L.Map) => void }): void {
    control?.addTo?.(this.map)
  }
  addEventListener(name: string, handler: (e: { point: Point }) => void): void {
    if (name === 'click') {
      this.map.on('click', (evt: L.LeafletMouseEvent) => {
        const p = new Point(evt.latlng.lng, evt.latlng.lat)
        handler({ point: p })
      })
    }
  }
  addOverlay(overlay: { addTo: (map: L.Map) => void }): void {
    overlay?.addTo?.(this.map)
  }
}

export async function loadOfflineBMap(): Promise<{
  Map: typeof Map
  Point: typeof Point
  Marker: typeof Marker
  NavigationControl: typeof NavigationControl
  ScaleControl: typeof ScaleControl
}> {
  const BMap = { Map, Point, Marker, NavigationControl, ScaleControl }
  ;(window as unknown as { BMap?: typeof BMap }).BMap = BMap
  return BMap
}

function getLocalTileUrlTemplate(): string {
  // 若你准备了本地瓦片，可按需调整路径，例如：/tiles/{z}/{x}/{y}.png 或 app://tiles/...
  // 默认返回 '/tiles/{z}/{x}/{y}.png'，若不存在则 Leaflet 仅显示空背景。
  return '/tiles/{z}/{x}/{y}.png'
}