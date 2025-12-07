## 目标
- 在 `home/index.vue` 新增一个“USB COM 控制台”界面：选择本地串口、连接/断开、发送指令（如 `DONE`），实时监听并打印串口输出。
- 对匹配指令行（例如 `SURF 2025-10-25_22:43:11 CSQ=4`）进行解析并高亮展示。

## 技术选型与架构
- 主进程串口管理：使用 `serialport`（需新增依赖），统一在主进程创建/管理连接，避免渲染进程直接访问硬件。
- 数据流：Renderer → IPC → Main（串口）→ IPC → Renderer，采用事件风格推送数据。
- 安全：通过 Preload 暴露有限 API，禁用渲染层直接 Node 能力。

## 主进程实现
- 新增 `serialService`：
  - `listPorts()`：枚举可用 COM 口（含 `path`、`manufacturer`、`serialNumber`）。
  - `open({ path, baudRate })`：打开指定串口（默认 `baudRate=115200`），挂 ReadlineParser 按行推送消息。
  - `close()`：关闭当前连接。
  - `write(line)`：发送一行指令结尾 `\r\n`（或可配置）。
  - 内部解析：匹配 `/^SURF\s+(\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2})\s+CSQ=(\d+)/`，将 `time` 与 `csq` 一并随原始行推给渲染层。
- IPC 通道：
  - `serial:list`、`serial:open`、`serial:close`、`serial:write`
  - `serial:onData`（主进程向渲染层推送，使用 `ipcMain`/`webContents.send` 加 `serial:data` 事件）

## Preload 暴露
- `window.api.serial.*`：
  - `list(): Promise<Port[]>`
  - `open(path: string, opts?: { baudRate?: number }): Promise<boolean>`
  - `close(): Promise<void>`
  - `write(text: string): Promise<void>`
  - `onData(handler: (payload) => void): () => void`（返回取消订阅函数）

## Renderer（Home 页新增界面）
- 新增组件 `UsbComConsole.vue`，在 `home/index.vue` 引入：
  - 左侧控制栏：串口下拉（自动枚举/刷新）、波特率输入、连接/断开按钮、发送输入框与“发送”按钮（默认发送 `DONE`）。
  - 右侧输出区域：
    - 滚动日志列表（时间戳、原始行文本）。
    - 若解析到 `SURF ... CSQ=4`，在顶部“解析栏”显示：`源命令= SURF`、时间、`CSQ` 数值。
  - 交互：连接成功后禁用串口选择；断开后恢复。

## 额外功能（可选，后续迭代）
- 自动发送：勾选“收到 SURF 则自动回复 DONE”。
- 日志持久化：写入日志文件（使用现有 `winston`）。
- 回车快捷发送；发送历史。

## 依赖与变更
- 新增依赖：`serialport`。
- 新增/修改文件：主进程串口服务与 IPC、Preload 暴露、`UsbComConsole.vue`、`home/index.vue` 引入。

## 验证
- 枚举串口列表正常；连接后能收到数据并实时打印。
- 发送 `DONE` 指令后设备有回显或行为（按设备协议）；UI 显示对应输出。
- 模拟串口输出，确保 `SURF ... CSQ=4` 正确解析高亮。

请确认该方案，确认后我将开始实现（包含依赖安装、主进程/预加载/渲染层代码与基础测试）。