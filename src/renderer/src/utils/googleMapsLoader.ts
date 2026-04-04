let googleMapsPromise: Promise<void> | null = null

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.maps?.Map) {
    return Promise.resolve()
  }
  if (!apiKey?.trim()) {
    return Promise.reject(new Error('Google Maps API key is empty (set VITE_GOOGLE_MAPS_API_KEY)'))
  }
  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    const callbackName = '__on_google_maps_init'
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const cleanup = (): void => {
      delete window.__on_google_maps_init
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const onFail = (err: Error | Event): void => {
      if (settled) return
      settled = true
      cleanup()
      googleMapsPromise = null
      reject(err instanceof Error ? err : new Error('Google Maps script load error'))
    }

    const onSuccess = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    window.__on_google_maps_init = (): void => {
      onSuccess()
    }

    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey.trim())}&callback=${callbackName}`
    script.addEventListener('error', onFail)
    document.head.appendChild(script)

    timeoutId = setTimeout((): void => {
      if (!window.google?.maps?.Map) {
        onFail(new Error('Google Maps API not initialized within timeout'))
      }
    }, 20000)
  })

  return googleMapsPromise
}
