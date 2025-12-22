## 问题与原因
- 接收端当前解析逻辑仅支持“头行 + 下一行是纯Base64数据”的两行模式（src/main/ipc/serial.ts:84–111、setupDataHandler 逻辑在 src/main/ipc/serial.ts:215–265）。
- 需求为“单包包含头和Base64内容”，即每一帧是一行：`I A4C1 1/2 CRC=... NAME=... <base64>`；现有解析器只识别到头，忽略后续 Base64（仍在同一行），因此不入库。

## 修改目标
- 接收端同时支持两种格式：
  1) 两行模式（现有）：头行 + 下一行仅Base64
  2) 单行模式（新增）：头 + Base64 同行
- 测试脚本按需求发送单包（头+Base64）两帧即可。

## 接收端改动（兼容两种模式）
- 文件：`src/main/ipc/serial.ts`
- 解析器：
  - 扩展 `parseImageFrame(line)`：在匹配头后，捕获头部后剩余的非空字符串作为 `data`（Base64），返回 `type: 'both' | 'header' | 'data'`。
  - 规则：`/^I\s+([A-F0-9]+)\s+(\d+)\/(\d+)\s*(?:CRC=([A-F0-9]+)\s+)?(?:NAME=([\w\d_\.]+))?(?:\s+([A-Za-z0-9+\/=]+))?$/`
- 处理逻辑：
  - 在 `setupDataHandler` 中：
    - 若 `type === 'header'`：保持现有逻辑，更新 `currentHeader`
    - 若 `type === 'data'`：保持现有逻辑，写入帧数据并更新进度
    - 若 `type === 'both'`：同时设置 `currentHeader` 并立即保存该行内的 `data`，更新进度；当 `count >= total` 时进入合并处理
- 保持兼容：现有两行模式仍正常工作；新增单行模式也会正常保存。

## 发送端改动（测试脚本）
- 文件：`scripts/test-send-image.js`
- 发送一行即一个包（头+Base64）：
  - 帧1：`I A4C1 1/2 CRC=F3A14C2B NAME=fm_20251220_141057.jpg <base64frame1>\r\n`
  - 帧2：`I A4C1 2/2 <base64frame2>\r\n`
- 默认 `--baud 9600`，与接收端一致；保留 `--port`、`--file`、`--name` 支持。
- 两帧间保留小延时（200ms）以便接收端稳定处理。

## 验证
- 运行：`node scripts/test-send-image.js --port COM2 --baud 9600`
- 观察主程序日志：
  - `Received image header: ...`（帧1/2）
  - `Received image data frame: ...`（帧1/2）
  - 帧累计达到 total 后触发合并与 `DONE` 响应（serial.ts:256–258）。

## 影响范围与安全性
- 改动仅在串口解析与测试脚本；不影响其他模块。
- 解析器正则和处理逻辑向后兼容现有两行格式，降低风险。

请确认后我将按上述方案修改接收端解析与测试脚本并联调。