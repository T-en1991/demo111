### PICSTART 指令分析

您提供的指令：`PICSTART ID=01 fm_20251027_134455.jpg`

#### 1. 这是用什么发的？
这个指令格式看起来是**铱星（Iridium）**通信或者**串口透传**的一种自定义协议。
*   它不像声通协议（`+++AT:...`）。
*   它有点像铱星的 `SURF` 格式（`SURF ID=...`）。
*   根据上下文，这很可能是通过**铱星**或者**串口**回传的图片开始信号。如果它是通过声通发回来的，那格式应该被包裹在 `+++AT` 中。如果它是直接作为文本收到的，那可能是铱星/串口。

#### 2. ID=01 现在的逻辑是什么？
在目前的 `ProtocolParser.ts` 中，**没有**针对 `PICSTART` 的解析逻辑。
*   `ACOUSTIC_REGEX` 处理 `+++AT`。
*   `STAT_REGEX` 处理 `STAT,ID=...`。
*   `IRIDIUM_SURF_REGEX` 处理 `SURF ID=...`。
*   `IRIDIUM_CHUNK_HEADER_REGEX` 处理 `I A4C1 1/19...`。

**结论**：目前的逻辑**无法识别** `PICSTART` 指令。

### 修复计划

我需要在 `ProtocolParser.ts` 中添加对 `PICSTART` 的支持。假设这是铱星协议的一部分（或者通用协议）。

1.  **添加正则**：
    ```typescript
    private static PICSTART_REGEX = /^PICSTART\s+ID=(\w+)\s+(.*)$/i
    ```
    *   Group 1: ID (e.g., `01`)
    *   Group 2: Filename (e.g., `fm_20251027_134455.jpg`)

2.  **更新 `parseIridium` 方法**：
    在 `ProtocolParser.ts` 的 `parseIridium`（或者如果是通过声通透传的，就在 `parseAcoustic` 的 STAT 分支附近，但看起来不像）中添加匹配逻辑。
    鉴于它没有 `+++AT` 头，最可能是作为**铱星消息**或者**串口消息**处理。

    如果这是一个新的事件类型（例如 `IMAGE_START`），我们需要在 `types.ts` 中定义它，并在 `tcp.ts` 或 `serial.ts` 中处理它（例如创建 Alert 或开始接收图片流程）。

**请确认**：这条指令是通过 TCP（铱星/声通）收到的，还是串口？
根据之前的 `SURF` 逻辑，我猜测这是铱星或 TCP 透传。我将把它添加到 `parseIridium` 中（因为它看起来像纯文本协议），或者创建一个通用的 `parseGeneral`。

为了稳妥，我会在 `parseIridium` 中添加支持，因为它与 `SURF` 格式高度相似。

**处理逻辑**：
解析出 `ID` 和 `Filename`，返回一个类型为 `PIC_START` 的事件。

我将立即修改 `ProtocolParser.ts`。