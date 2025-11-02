# ocean-fish

An Electron application with Vue and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## 项目结构与文件说明

下面按照目录层级说明项目中各主要文件/目录的作用，便于理解与维护。

### 根目录
- `package.json`：项目元数据与脚本入口；`main` 指向打包后主进程入口 `out/main/index.js`；包含 `dev/build` 等脚本。
- `electron.vite.config.ts`：`electron-vite` 配置，分别定义 `main/preload/renderer` 的构建与插件，`@renderer` 路径别名在此声明。
- `electron-builder.yml`：打包发布配置（`appId/productName/asarUnpack/targets` 等），以及 macOS 权限、各平台产物命名。
- `dev-app-update.yml`：`electron-updater` 更新源配置（示例使用 generic provider）。
- `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json`：TypeScript 项目引用与分别针对主进程/渲染进程的编译与类型检查设置。
- `eslint.config.mjs`：ESLint 配置，整合 TS、Vue 与 Prettier 的规则。
- `.prettierrc.yaml` / `.prettierignore`：Prettier 格式化规则与忽略列表。
- `.editorconfig`：编辑器通用编码风格设定。
- `.gitignore`：Git 忽略文件列表（`node_modules/dist/out` 等）。
- `.npmrc`：镜像与二进制下载配置（Electron、electron-builder）。
- `.vscode/`：推荐的 VSCode 工作区设置与调试配置。
- `build/`：打包资源与平台权限文件，例如：
  - `entitlements.mac.plist`：macOS 沙箱相关权限；
  - `icon.icns/icon.ico/icon.png`：应用图标资源。
- `resources/`：运行时资源（如 `icon.png`），会被放入打包后的 `resources` 目录中。
- `out/`：由 `electron-vite` 编译生成的产物（JS/静态文件），`package.json.main` 指向此目录下主进程入口。

### 源码目录 `src/`

#### 主进程 `src/main/`
- `index.ts`：主进程入口。调用 `setupApp()` 完成生命周期与快捷键设置，创建主窗口 `createMainWindow()`，集中注册 IPC `registerIpc()`，处理 macOS `activate` 重新建窗逻辑。
- `app.ts`：应用生命周期封装：等待 `app.whenReady`、设置 `userModelId`、监听 `browser-window-created` 以启用 DevTools 快捷键、处理 `window-all-closed` 的退出行为（macOS 除外）。
- `windows/mainWindow.ts`：主窗口创建与管理。设置 `BrowserWindow` 参数、注入 `preload`、阻止 `window.open` 并通过 `shell.openExternal` 打开外链；按环境加载开发 URL 或生产 `index.html`。
- `ipc/index.ts`：IPC 注册汇总入口，统一调用各模块的注册函数。
- `ipc/system.ts`：系统类 IPC 示例，当前包含 `ping` 通道（`ipcMain.on('ping')`）。可在此扩展更多通道。

#### 预加载脚本 `src/preload/`
- `index.ts`：通过 `contextBridge` 向渲染进程安全暴露 `electronAPI` 及自定义 `api` 对象（当启用 `contextIsolation` 时）。
- `index.d.ts`：为全局 `window.electron` / `window.api` 提供类型声明，便于在渲染进程获得类型提示。

#### 渲染进程 `src/renderer/`
- `index.html`：渲染进程入口 HTML，加载前端入口 `src/main.ts`（位于 `src/renderer/src`）。
- `src/`：前端应用源码（Vue 3 + TS）：
  - `main.ts`：前端入口文件，挂载应用。
  - `App.vue`：示例主组件，包含向主进程发送 `ping` 的交互。
  - `components/Versions.vue`：展示 Electron/Chromium/Node 版本信息。
  - `assets/`：静态资源与样式（`main.css/base.css` 等）。

### 运行与打包
- 开发：`npm run dev` 启动主/预加载/渲染三端的开发服务与 HMR。
- 预览：`npm start` 使用编译产物启动 Electron（在某些模板中提供）。
- 构建：`npm run build` 进行类型检查与编译；随后可用 `npm run build:mac|win|linux` 进行打包。

### 常见扩展点
- 新增 IPC：在 `src/main/ipc/` 新建文件并在 `ipc/index.ts` 中注册；渲染进程通过 `window.electron.ipcRenderer.send/handle` 使用。
- 多窗口：如需管理多窗口，可新增 `windows/windowManager.ts`，集中维护窗口实例与路由。
- 菜单/托盘：可按需新增 `src/main/menu/`、`src/main/tray/` 模块，并在 `index.ts` 入口接入。
