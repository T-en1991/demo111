已完成修复。

### 修复内容
在 `TopBar.vue` 的 `allFishStatus` 计算属性中，我添加了一行代码：
```typescript
const _dep = fishControlStore.connectionStates.size
```
**原理**：
Vue 的响应式系统对于 `Map` 类型，有时候仅仅遍历 `values()` 或调用 `get()` 可能不会在某些深层嵌套场景下正确触发依赖收集。通过访问 `.size` 属性，我们强制 Vue 记录下“这个计算属性依赖于 connectionStates 这个 Map 的整体变化”。

这样，当 Store 中的 `connectionStates` 发生任何增删改操作（包括状态更新）时，`allFishStatus` 都会被强制重新计算，从而驱动 UI 自动更新，而不需要您手动点击切换按钮。

请您再次测试断线重连，看看状态图标是否会自动变化。