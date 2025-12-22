## 目标

* 新增一个独立测试脚本（不修改现有 send-surf），读取指定文件并通过串口分两次发送。

* 默认读取文件：`E:\winscp\Logs\anomaly_alerts\session_20251206_060000\fm_20251220_141057.jpg`。

* 帧格式：

  * 第一次：`I A4C1 1/2 CRC=<crc32> NAME=fm_20251220_141057.jpg <base64frame1>`

  * 第二次：`I A4C1 2/2 <base64frame2>`

## 文件与命令

* 新增脚本：`scripts/test-send-image.js`

* 默认参数：

  * `--port COM1`（可改）

  * `--baud 115200`（可改）

  * `--file` 默认为上述路径，可覆盖

  * `--name` 默认从文件名自动取，可覆盖

* 运行示例：

  * `node scripts/test-send-image.js --port COM1 --baud 115200`

  * 或 `node scripts/test-send-image.js --file "E:\winscp\Logs\anomaly_alerts\session_20251206_060000\fm_20251220_141057.jpg"`

## 技术实现

* 使用 `serialport` 打开串口，逐行写入（以 `\r\n` 结束）。

* 读取图片为 `Buffer`，生成 Base64。

* 计算 CRC32（标准多项式 0xEDB88320，初始 0xFFFFFFFF），输出 8 位大写十六进制，放入第一帧。

* 将 Base64 按长度平分为两段：`frame1`、`frame2`。

* 发送两行：

  * `I A4C1 1/2 CRC=<CRC> NAME=<NAME> <frame1>\r\n`

  * `I A4C1 2/2 <frame2>\r\n`

* 打印发送日志、字节数与 CRC。

## 验证

* 在目标串口监视端确认收到两行，第一行包含 CRC 和 NAME，拼接两段 Base64 可还原原图。

## 变更范围

* 仅新增 `scripts/test-send-image.js`，不影响现有脚本与业务逻辑。

