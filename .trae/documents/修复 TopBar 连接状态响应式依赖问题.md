### TopBar 状态更新问题分析

您提到：“还是没有解决，我在点击 `switchFish(item.id)` 这个的时候才会更新”。

这非常明确地指向了 **响应式依赖丢失** 的问题。

在 `TopBar.vue` 中：
```typescript
const allFishStatus = computed(() => {
  const list: Array<...> = []
  if (fishControlStore.fishMap instanceof Map) {
      for (const fish of fishControlStore.fishMap.values()) {
          // 这里是关键点
          const status = fishControlStore.connectionStates.get(fish.id) || 'disconnected'
          // ...
          list.push({ ... })
      }
  }
  return list
})
```

**问题根源**：
`fishControlStore.connectionStates` 是一个 `Map` 对象 (`ref(new Map())`)。
在 Vue 3 中，`computed` 能够自动追踪 `Map` 的 `.get()` 操作，前提是这个 `Map` 是响应式的（reactive）。
虽然 Store 中定义了 `const connectionStates = ref(new Map())`，但在 `computed` 内部遍历 `fishMap` 并调用 `connectionStates.get(fish.id)` 时，Vue 的依赖收集系统**有时**可能无法精确捕捉到 `Map` 内部具体某个 key 的变化，特别是当 `connectionStates` 作为一个整体 Ref 被访问时。

更重要的是，当您点击 `switchFish` 时，可能会触发某些副作用（如 `activeFishId` 变化），而 `currentFishStatus` 依赖于 `activeFishId` 和 `allFishStatus`。这种重新计算可能“顺便”刷新了视图。

**为什么自动重连时不更新？**
因为 Store 只是修改了 `Map` 中的值 (`connectionStates.value.set(id, status)`). 虽然 Vue 3 的 `Reactive Map` 支持响应式，但如果 `TopBar.vue` 中的 `computed` 没有正确建立起对这个 Map 的依赖，或者 Store 传递出来的 Map 响应式丢失，就不会触发重算。

### 修复方案

为了确保 `TopBar` 能监听到 `connectionStates` 的变化，最稳妥的方法是：
1.  **显式依赖**：在 `computed` 中显式访问 `fishControlStore.connectionStates`（甚至访问其 `.size` 或展开它），以确保 Vue 知道这个 computed 依赖于该 Map。
2.  **强制触发**：或者，当 `connectionStates` 更新时，触发整个 Map 的引用变化（虽然性能略低，但绝对可靠）。但在 Store 中 `connectionStates` 是 `ref(Map)`，如果只改内部值，引用不变。

**更直接的修复**：
在 `TopBar.vue` 的 `computed` 函数开头，添加一行代码来“注册”对 `connectionStates` 的依赖：
```typescript
// 强制依赖收集
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _trigger = fishControlStore.connectionStates.size 
// 或者更强力一点，如果是 Map，Vue3 的响应式应该能处理 get。
```

**另一种可能**：
`fishControlStore.fishMap` 的遍历才是主循环。如果 `fishMap` 没变，且 `connectionStates` 的依赖没挂上，就不会重算。

让我们尝试在 `TopBar.vue` 中修改 `allFishStatus` 的实现，确保它能响应 `connectionStates` 的变化。

我将修改 `TopBar.vue`，在 `computed` 中添加对 `connectionStates` 的显式解构或遍历依赖。