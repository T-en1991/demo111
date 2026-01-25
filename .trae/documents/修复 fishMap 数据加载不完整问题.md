经过代码调查，我找到了“只显示一条鱼”的原因。

### 原因分析
在 `src/renderer/src/views/login/index.vue`（登录页）中，登录成功后的逻辑是：
```typescript
window.api.fish.findAll().then(async (list) => {
  if (list && list.length > 0) {
    const firstFish = list[0] as any
    fishControlStore.setCurrentFish(firstFish) // 关键点：只设置了第一条鱼
    // ...
  }
})
```
`setCurrentFish(fish)` 方法虽然会将鱼存入 `fishMap`，但由于这里**只对列表中的第一条鱼**调用了这个方法，导致 `fishMap` 中只缓存了这一条鱼的数据。

### 修复方案
我们需要在登录成功后（或者 App 初始化时），将**所有**从后端获取到的机器鱼都加载到 Store 的 `fishMap` 中。

**具体步骤**：
1.  **修改 Store**：在 `fishControlStore` 中增加一个 `setAllFish(list: Fish[])` 方法，用于批量加载鱼配置到 `fishMap`。
2.  **修改 Login**：登录后调用 `setAllFish(list)`，确保 Store 知道所有鱼的存在。
3.  **修改 Fish 管理页**：在进入管理页或保存时，也应该同步更新 Store 中的列表，确保数据一致性。

这样，TopBar 的连接列表就能显示所有已配置的鱼了。需要我执行这个修复吗？