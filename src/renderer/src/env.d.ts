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
    // 引入 Prisma 类型以使用明确的模型类型
    // 注意：此处仅作类型引用，不会引入运行时依赖
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    // @ts-ignore: 在全局声明中使用 import() 类型引用以避免运行时依赖，TypeScript 在此处的模块合并可能出现误报；忽略一次以允许 window.api 的类型合并
    
    // 与 preload/index.d.ts 保持一致的类型定义，避免 renderer 中访问 window.api 时为 unknown
    api: {
      quitApp(): void
      fish: {
        findAll(): Promise<import('@prisma/client').Fish[]>
        findById(id: number): Promise<import('@prisma/client').Fish | null>
        search(query: { name?: string; type?: string; status?: 'running' | 'stopped' }): Promise<import('@prisma/client').Fish[]>
        create(data: {
          name: string;
          ip?: string | null;
          port?: number | null;
          type?: string;
          status?: 'running' | 'stopped';
          ascendCommand?: string | null;
          descendCommand?: string | null;
          forwardCommand?: string | null;
          leftCommand?: string | null;
          rightCommand?: string | null;
          manualCommand?: string | null;
          exitManualCommand?: string | null;
          returnCommand?: string | null;
          description?: string | null;
          track?: import('@prisma/client').Prisma.JsonValue | null;
        }): Promise<import('@prisma/client').Fish>
        update(id: number, data: {
          name?: string;
          ip?: string | null;
          port?: number | null;
          type?: string;
          status?: 'running' | 'stopped';
          ascendCommand?: string | null;
          descendCommand?: string | null;
          forwardCommand?: string | null;
          leftCommand?: string | null;
          rightCommand?: string | null;
          manualCommand?: string | null;
          exitManualCommand?: string | null;
          returnCommand?: string | null;
          description?: string | null;
          track?: import('@prisma/client').Prisma.JsonValue | null;
        }): Promise<import('@prisma/client').Fish>
        delete(id: number): Promise<import('@prisma/client').Fish>
        deleteMany(ids: number[]): Promise<import('@prisma/client').Prisma.BatchPayload>
        seed(count: number): Promise<import('@prisma/client').Prisma.BatchPayload>
      }
    }
    // 百度地图 WebGL 全局对象挂载到 window
    BMapGL?: unknown
    // 百度地图 2D 版本全局对象备用
    BMap?: unknown
    // 百度地图 2D 回调（通过 script 的 callback 参数触发）
    __on_bmap_init?: () => void
  }
}

export { }
