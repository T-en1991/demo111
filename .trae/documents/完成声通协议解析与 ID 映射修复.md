修复已完成。

### 修复总结
1.  **修正协议解析 (`ProtocolParser.ts`)**：
    *   将声通 AT 消息的解析逻辑修正为提取 **Group 3 (srcId)** 作为消息来源 ID。
    *   这意味着 `+++AT:57:RECVIM, 16,2,1...` 中的 **2** 会被正确识别为发送方 ID（鱼的 `acousticId`）。

2.  **完善 TCP 消息处理 (`tcp.ts`)**：
    *   在处理所有声通事件（报警、命令回执等）时，先使用 `fishService.findByAcousticId(event.srcId)` 查找对应的机器鱼。
    *   将找到的 `fishId`（数据库主键）关联到 `Alert` 记录中。

3.  **增强数据库查询 (`database/index.ts`)**：
    *   在 `fishService` 中新增了 `findByAcousticId` 方法，支持模糊匹配（如 "1", "01" 都能匹配），提高了查找的鲁棒性。

### 结果
现在，当您的程序接收到 `RECVIM` 报警或 `NAVIGATE-SUCCESS` 等回执时：
1.  程序会正确识别出这是哪条鱼（通过声通 ID，如 2）。
2.  报警信息会正确关联到该鱼的数据库记录。
3.  前端展示时，就能显示出具体是哪条鱼的报警了（而不仅仅是一个未知来源的消息）。

这完全符合您对声通 ID (`acousticId`) 和鱼 ID (`fishCode`) 的区分逻辑。