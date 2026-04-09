import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// 最小离线适配层，提供与当前页面使用一致的 BMap API 子集

class Size {
  width: number
  height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
}

class Point {
  lng: number
  lat: number
  constructor(lng: number, lat: number) {
    this.lng = lng
    this.lat = lat
  }
}

class Icon {
  icon: L.Icon
  constructor(url: string, size: Size, opts?: { imageSize?: Size; anchor?: Size }) {
    this.icon = L.icon({
      iconUrl: url,
      iconSize: [size.width, size.height],
      iconAnchor: opts?.anchor ? [opts.anchor.width, opts.anchor.height] : undefined
    })
  }
}

class Label {
  content: string
  opts?: { offset?: Size }
  style?: Record<string, string>
  private _update?: () => void

  constructor(content: string, opts?: { offset?: Size }) {
    this.content = content
    this.opts = opts
  }

  setStyle(style: Record<string, string>): void {
    this.style = style
    this._update?.()
  }

  setContent(content: string): void {
    this.content = content
    this._update?.()
  }

  _bindUpdate(fn: () => void): void {
    this._update = fn
  }
}

class Marker {
  private marker: L.Marker
  private label?: Label

  constructor(point: Point, opts?: { icon?: Icon }) {
    const options: L.MarkerOptions = {}
    if (opts?.icon) {
      options.icon = opts.icon.icon
    }
    this.marker = L.marker([point.lat, point.lng], options)
  }

  addTo(map: L.Map): void {
    this.marker.addTo(map)
  }

  setPosition(point: Point): void {
    this.marker.setLatLng([point.lat, point.lng])
  }

  setIcon(icon: Icon): void {
    this.marker.setIcon(icon.icon)
  }

  setZIndex(zIndex: number): void {
    this.marker.setZIndexOffset(zIndex)
  }

  setLabel(label: Label | null): void {
    if (!label) {
      this.label = undefined
      this.marker.unbindTooltip()
      return
    }
    this.label = label
    this.updateLabel()
    label._bindUpdate(() => this.updateLabel())
  }

  getLabel(): Label | undefined {
    return this.label
  }

  private updateLabel(): void {
    if (!this.label) return
    let contentHtml = this.label.content
    if (this.label.style) {
      const styleStr = Object.entries(this.label.style)
        .map(([k, v]) => `${k}:${v}`)
        .join(';')
      contentHtml = `<div style="${styleStr}">${this.label.content}</div>`
    }
    // Leaflet tooltip allows HTML content
    this.marker.unbindTooltip()
    this.marker.bindTooltip(contentHtml, {
      permanent: true,
      direction: 'right',
      offset: this.label.opts?.offset
        ? [this.label.opts.offset.width, this.label.opts.offset.height]
        : [0, 0],
      className: 'offline-label-reset' // Optional: a class to reset leaflet styles if needed
    })
  }

  addEventListener(event: string, handler: () => void): void {
    this.marker.on(event, handler)
  }

  remove(): void {
    this.marker.remove()
  }
}

class Polyline {
  private polyline: L.Polyline
  constructor(
    points: Point[],
    opts?: { strokeColor?: string; strokeWeight?: number; strokeOpacity?: number }
  ) {
    this.polyline = L.polyline(
      points.map((p) => [p.lat, p.lng]),
      {
        color: opts?.strokeColor,
        weight: opts?.strokeWeight,
        opacity: opts?.strokeOpacity
      }
    )
  }
  addTo(map: L.Map): void {
    this.polyline.addTo(map)
  }
  remove(): void {
    this.polyline.remove()
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
  private pickPopup: L.Popup | null = null
  constructor(container: string | HTMLElement) {
    const el =
      typeof container === 'string' ? (document.getElementById(container) as HTMLElement) : container
    this.map = L.map(el, { zoomControl: false, scrollWheelZoom: false })
    el.style.background = '#1e2030'
    const template = getLocalTileUrlTemplate()
    if (template) {
      try {
        L.tileLayer(template, { maxZoom: 18, minZoom: 3, crossOrigin: true }).addTo(this.map)
      } catch (err) {
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
  removeOverlay(overlay: { remove: () => void }): void {
    overlay?.remove?.()
  }
  closePickPopup(): void {
    if (this.pickPopup) {
      this.map.closePopup(this.pickPopup)
      this.pickPopup = null
    }
  }
  openPickPopup(lat: number, lng: number, el: HTMLElement): void {
    this.closePickPopup()
    this.pickPopup = L.popup({
      className: 'map-coord-leaflet-popup',
      closeButton: true,
      autoPan: true,
      maxWidth: 280
    })
      .setLatLng([lat, lng])
      .setContent(el)
    this.pickPopup.openOn(this.map)
  }
}

export async function loadOfflineBMap(): Promise<{
  Map: typeof Map
  Point: typeof Point
  Size: typeof Size
  Icon: typeof Icon
  Label: typeof Label
  Marker: typeof Marker
  Polyline: typeof Polyline
  NavigationControl: typeof NavigationControl
  ScaleControl: typeof ScaleControl
}> {
  const BMap = {
    Map,
    Point,
    Size,
    Icon,
    Label,
    Marker,
    Polyline,
    NavigationControl,
    ScaleControl
  }
  ;(window as unknown as { BMap?: typeof BMap }).BMap = BMap
  return BMap
}

function getLocalTileUrlTemplate(): string {
  // 若你准备了本地瓦片，可按需调整路径，例如：/tiles/{z}/{x}/{y}.png 或 app://tiles/...
  // 默认返回 '/tiles/{z}/{x}/{y}.png'，若不存在则 Leaflet 仅显示空背景。
  return '/tiles/{z}/{x}/{y}.png'
}
