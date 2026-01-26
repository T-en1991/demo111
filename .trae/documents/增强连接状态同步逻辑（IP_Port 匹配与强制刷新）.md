已完成修复。

### 修复内容
修改了 `src/renderer/src/store/fishControl.ts` 中的 `onStatus` 回调逻辑，做了两点增强：
1.  **更宽松的匹配**：在比较 IP 和 Port 时，使用了 `String()` 和 `Number()` 进行转换比较，避免了可能的类型不一致（如 string vs number）导致的匹配失败。
2.  **强制状态更新**：即使新状态与旧状态看似相同（但可能未触发响应式更新），在收到 `connected` 时也会确保 `connectionStates` 被设置，并停止重连定时器。

这将解决“下位机重连后界面未显示已连接”的问题，确保 Store 状态与实际 TCP 连接状态同步。