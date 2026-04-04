/// <reference types="vite/client" />
/// <reference types="google.maps" />

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
    // 引入 Prisma 类型以使用明确的模型类型
    // 注意：此处仅作类型引用，不会引入运行时依赖

    // @ts-ignore: 在全局声明中使用 import() 类型引用以避免运行时依赖，TypeScript 在此处的模块合并可能出现误报；忽略一次以允许 window.api 的类型合并

    /** 离线地图适配层仍挂载伪 BMap（Leaflet） */
    BMap?: unknown
    /** Google Maps JS API（脚本加载完成后存在） */
    google?: typeof google
    __on_google_maps_init?: () => void
  }
}

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
}

export type RendererImportMetaEnvKeys = keyof ImportMetaEnv

export {}
