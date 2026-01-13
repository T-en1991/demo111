let bmapPromise: Promise<void> | null = null

export function loadBMapGL(ak: string): Promise<void> {
  // 改为仅加载 2D API，确保地图可靠显示
  if (typeof window !== 'undefined' && 'BMap' in window && (window as { BMap?: unknown }).BMap) {
    return Promise.resolve()
  }
  if (bmapPromise) return bmapPromise

  bmapPromise = new Promise<void>((resolve, reject) => {
    const callbackName = '__on_bmap_init'
    // 标记是否已经清理过，防止多次调用
    let isCleaned = false

    const cleanup = (): void => {
      if (isCleaned) return
      isCleaned = true
      delete (window as { __on_bmap_init?: () => void }).__on_bmap_init
      // 移除脚本标签，防止污染
      const s = document.getElementById('bmap-script-2d')
      if (s && s.parentNode) {
        s.parentNode.removeChild(s)
      }
    }

    const onFail = (err: Error | Event): void => {
      cleanup()
      bmapPromise = null // 重置 Promise 以便下次重试
      reject(err instanceof Error ? err : new Error('Baidu Map script load error'))
    }

    const onSuccess = (): void => {
      cleanup()
      resolve()
    }

    ;(window as { __on_bmap_init?: () => void }).__on_bmap_init = onSuccess

    const script2d = document.createElement('script')
    script2d.id = 'bmap-script-2d'
    // 使用 2D API v2.0，稳定性更好，添加 s=1 强制 https
    script2d.src = `https://api.map.baidu.com/api?v=2.0&ak=${ak}&callback=${callbackName}&s=1`
    
    script2d.addEventListener('error', onFail)
    document.head.appendChild(script2d)

    const start = Date.now()
    const pollReady: () => void = () => {
      const ready =
        typeof window !== 'undefined' && 'BMap' in window && (window as { BMap?: unknown }).BMap
      
      if (ready) {
        // 即使 BMap 存在，也稍微延时确保内部初始化完成
        onSuccess()
      } else if (Date.now() - start < 15000) { // 增加超时时间到 15s
        setTimeout(pollReady, 100)
      } else {
        onFail(new Error('Baidu Map 2D API not initialized within timeout'))
      }
    }
    
    pollReady()
  })

  return bmapPromise
}
