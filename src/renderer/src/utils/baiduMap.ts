let bmapPromise: Promise<void> | null = null

export function loadBMapGL(ak: string): Promise<void> {
  // 改为仅加载 2D API，确保地图可靠显示
  if (
    typeof window !== 'undefined' &&
    'BMap' in window &&
    (window as { BMap?: unknown }).BMap
  ) {
    return Promise.resolve()
  }
  if (bmapPromise) return bmapPromise

  bmapPromise = new Promise<void>((resolve, reject) => {
    const callbackName = '__on_bmap_init'
    ;(window as { __on_bmap_init?: () => void }).__on_bmap_init = (): void => {
      cleanup()
      resolve()
    }

    const script2d = document.createElement('script')
    // 使用 2D API v2.0，稳定性更好
    script2d.src = `https://api.map.baidu.com/api?v=2.0&ak=${ak}&callback=${callbackName}`
    // 使用事件监听修复 OnErrorEventHandler 类型不兼容问题
    script2d.addEventListener('error', (e) => {
      cleanup()
      reject(e instanceof Event ? e : new Error('Baidu Map script load error'))
    })
    document.head.appendChild(script2d)

    const start = Date.now()
    const pollReady: () => void = () => {
      const ready =
        typeof window !== 'undefined' && 'BMap' in window && (window as { BMap?: unknown }).BMap
      if (ready) {
        cleanup()
        resolve()
      } else if (Date.now() - start < 10000) {
        setTimeout(pollReady, 50)
      } else {
        cleanup()
        reject(new Error('Baidu Map 2D API not initialized'))
      }
    }
    const cleanup = (): void => {
      delete (window as { __on_bmap_init?: () => void }).__on_bmap_init
    }
    pollReady()
  })

  return bmapPromise
}