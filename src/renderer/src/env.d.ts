/// <reference types="vite/client" />

// 为 Vue 单文件组件提供类型声明，避免 `import '*.vue'` 报错
declare module '*.vue' {
  // 使用宽松的 unknown，避免对 Vue 类型的直接依赖与 `{}` 类型警告
  const component: unknown
  export default component
}

// 声明全局 window.electron 类型，匹配 @electron-toolkit/preload 暴露的 API
declare global {
  interface Window {
    // 与 preload/index.d.ts 的声明保持一致，避免类型合并冲突
    electron: import('@electron-toolkit/preload').ElectronAPI
    // 与 preload/index.d.ts 保持一致的宽松类型
    api: unknown
    // 百度地图 WebGL 全局对象挂载到 window
    BMapGL?: unknown
    // 百度地图 2D 版本全局对象备用
    BMap?: unknown
    // 百度地图 2D 回调（通过 script 的 callback 参数触发）
    __on_bmap_init?: () => void
  }
}

export {}
