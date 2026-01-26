已完成修复。

### 修复内容
1.  **新增事件类型**：在 `types.ts` 中添加了 `PIC_START` 到 `IridiumEvent` 类型定义中，并支持 `filename` 字段。
2.  **实现解析逻辑**：在 `ProtocolParser.ts` 中：
    *   定义了正则：`PICSTART_REGEX = /^PICSTART\s+ID=(\w+)\s+(.*)$/i`。
    *   在 `parseIridium` 方法中增加了对 `PICSTART` 的匹配逻辑，能够解析出 `ID` (e.g. "01") 和 `filename` (e.g. "fm_2025...jpg")。

现在系统可以正确识别并解析 `PICSTART ID=01 fm_...jpg` 指令了。后续如果需要在 `tcp.ts` 中处理该事件（如创建报警或开始接收文件流程），可以在 `IridiumEvent` 的处理分支中添加对应逻辑。目前解析层已就绪。