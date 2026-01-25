已完成修复。

### 修复内容
1.  **前端解析适配 (`realtimeDataParser.ts`)**：
    *   调整了 `StatDataStrategy` 的解析索引，以适配您确认的格式：
        `STAT,ID=xx,yaw,pitch,roll,lon,lat,depth,alt,bat,signal,time`
    *   现在解析器会正确跳过 `ID` 字段，提取后续的 yaw, pitch, roll, lon, lat 等信息。

2.  **后端静默处理 (`tcp.ts`)**：
    *   在处理 TCP 消息时，对于 `STATUS` 类型的消息，现在会直接忽略（不存入 Alert 表，不弹窗），避免高频的状态数据刷屏干扰用户。
    *   数据依然通过 `tcp:data` 通道转发给前端，由前端实时解析并更新仪表盘。

现在，当收到 `STAT` 消息时，Screen 页面的仪表盘应该能实时更新状态，且不会弹出烦人的提示框。