### 排查分析

您提到的问题是：接收到 `+++AT:56:RECVIM, 15,2,1, ack, 307242, -23,259, -0.0023, WIFIOFF-SUCCESS` 消息时，前端没有弹出 `ElMessage` 提示。

#### 1. 协议解析层 (`ProtocolParser.ts`)
检查发现 `ProtocolParser` 目前只处理了 `WIFI-SUCCESS` (开启 Wi-Fi 成功) 和 `WIFIOFF-SUCCESS` (关闭 Wi-Fi 成功)。
在 `ProtocolParser.ts` 中：
```typescript
if (payloadStr.includes('WIFIOFF-SUCCESS')) {
  return { type: 'WIFI_OFF_SUCCESS', raw: data, srcId: src }
}
```
**问题点**：虽然这里定义了 `WIFI_OFF_SUCCESS` 类型，但是否正确返回了这个类型？
是的，正则匹配应该没问题。

#### 2. 消息处理层 (`tcp.ts`)
检查 `tcp.ts` 中的 `titleMap`：
```typescript
const titleMap: Record<string, string> = {
    'NAV_SUCCESS': 'Navigation Mode Entered',
    'MAN_SUCCESS': 'Manual Mode Entered',
    'WIFI_SUCCESS': 'Wi-Fi Enabled',
    'WIFI_OFF_SUCCESS': 'Wi-Fi Disabled',
    'RETURN_SUCCESS': 'Return Mode Entered',
    'CMD_ACK': 'Command Acknowledged'
}
```
这里确实包含了 `WIFI_OFF_SUCCESS`。

#### 3. 潜在原因
最可能的原因是 `ProtocolParser.ts` 中的匹配顺序或逻辑有误。
请注意 `ProtocolParser.ts` 中的这段代码：
```typescript
if (payloadStr.includes('WIFI-SUCCESS')) {
  return { type: 'WIFI_SUCCESS', raw: data, srcId: src }
}
if (payloadStr.includes('WIFIOFF-SUCCESS')) {
  return { type: 'WIFI_OFF_SUCCESS', raw: data, srcId: src }
}
```
**关键问题**：`WIFIOFF-SUCCESS` 这个字符串中包含了 `WIFI-SUCCESS`！
因为 `includes('WIFI-SUCCESS')` 在前，所以 `WIFIOFF-SUCCESS` 消息会被**错误地**匹配为 `WIFI_SUCCESS` 类型（如果仅仅是 `includes` 判断的话）。
不，等等，`WIFIOFF-SUCCESS` 包含的是 `WIFI` 和 `OFF` 和 `SUCCESS`，并不直接包含 `WIFI-SUCCESS`（中间有 OFF）。
仔细看：`WIFI` `OFF` `-` `SUCCESS`。
而 `WIFI-SUCCESS` 是 `WIFI` `-` `SUCCESS`。
字符串 `WIFIOFF-SUCCESS` **并不包含** `WIFI-SUCCESS`。所以 `includes` 应该没问题。

**但是**，让我们再仔细看 `ProtocolParser.ts` 的逻辑。
`WIFIOFF-SUCCESS` 的判断逻辑：
```typescript
      if (payloadStr.includes('WIFI-SUCCESS')) {
        return { type: 'WIFI_SUCCESS', raw: data, srcId: src }
      }
      if (payloadStr.includes('WIFIOFF-SUCCESS')) {
        return { type: 'WIFI_OFF_SUCCESS', raw: data, srcId: src }
      }
```
如果消息是 `... WIFIOFF-SUCCESS`，它确实不包含 `WIFI-SUCCESS`。

**另一个可能的原因**：正则匹配的空格处理。
输入消息：`... -0.0023, WIFIOFF-SUCCESS` (注意逗号后有空格)
代码中：
```typescript
const contentRaw = atMatch[5].trim()
const parts = contentRaw.split(',')
const payloadStr = parts.slice(4).join(',') 
```
`payloadStr` 会包含 `WIFIOFF-SUCCESS`。

**调试方向**：
我会添加一些日志来确认解析出来的 `event.type` 到底是什么，或者直接在 `ProtocolParser` 中调整顺序以防万一（虽然理论上不包含）。
或者，检查 `tcp.ts` 中是否正确处理了 `WIFI_OFF_SUCCESS` 类型。

**修正计划**：
1.  为了稳妥，将 `WIFIOFF-SUCCESS` 的判断提到 `WIFI-SUCCESS` 之前。
2.  检查 `tcp.ts` 中的 `titleMap` 是否拼写正确（已确认正确）。
3.  确保前端 `ElMessage` 能正常显示。

我将调整 `ProtocolParser` 的顺序，并添加更详细的日志。

**Wait**，我看了一下 `ProtocolParser.ts` 的代码：
```typescript
      if (payloadStr.includes('WIFI-SUCCESS')) {
        return { type: 'WIFI_SUCCESS', raw: data, srcId: src }
      }
```
如果消息是 `WIFIOFF-SUCCESS`，它确实**不包含** `WIFI-SUCCESS`。
但是，如果消息格式有变，比如 `WIFI-OFF-SUCCESS`？用户给的例子是 `WIFIOFF-SUCCESS`。

让我再检查一下 `src/main/ipc/tcp.ts` 的修改是否生效了。
是的，上次修改已经加入了 `Send Toast to Renderer` 的逻辑。

**唯一的疑点**：
`tcp.ts` 中：
```typescript
const title = titleMap[event.type] || `Event: ${event.type}`
```
如果 `event.type` 是 `WIFI_OFF_SUCCESS`，那么 `title` 就是 `Wi-Fi Disabled`。
然后发送 IPC。

我将调整 `ProtocolParser.ts` 的顺序，并确保所有分支都能覆盖。同时，我会在 `tcp.ts` 中添加一行日志，明确打印出“发送 Toast”的操作，以便排查。

**补充**：
还有一种可能是前端没有收到 IPC 消息，或者 `ElMessage` 被屏蔽了。但之前测试 `MANUAL-SUCCESS` 是可以的。

**行动**：
1.  调整 `ProtocolParser.ts` 顺序（防御性编程）。
2.  在 `tcp.ts` 中添加日志 `logger.info('Sending toast to renderer:', title)`。

**最可能的真正原因**：
仔细看用户提供的消息：`+++AT:56:RECVIM, 15,2,1, ack, 307242, -23,259, -0.0023, WIFIOFF-SUCCESS`
这里的 payload 部分（第5个逗号后）：`307242, -23,259, -0.0023, WIFIOFF-SUCCESS`
`parts` 分割后：
0: `307242`
1: ` -23`
2: `259`
3: ` -0.0023`
4: ` WIFIOFF-SUCCESS`

`payloadStr` = `parts.slice(4).join(',')` = ` WIFIOFF-SUCCESS`。
`includes('WIFIOFF-SUCCESS')` 应该是 `true`。

那就只能是 **`tcp.ts` 逻辑没走到 else 分支**？
`if (event.type === 'ALARM')` ...
`ALARM` 的判断是 `payloadStr.includes('ID=') && payloadStr.includes('IMG=')`。
`WIFIOFF-SUCCESS` 显然不满足这个，所以会进 `else`。

**结论**：逻辑看起来是对的。我将添加日志来确认为什么没弹窗。同时为了保险，调整解析顺序。