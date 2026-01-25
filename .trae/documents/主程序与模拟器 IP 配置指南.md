主程序启动后未自动连接模拟器（或其他设备）的原因在于：**虽然我们在 `App.vue` 中调用了 `initListeners`，但我们并没有调用 `connect` 方法来发起 TCP 连接。**

### 问题分析
1.  **监听器已就绪**：`App.vue` 中的 `fishControlStore.initListeners()` 只是注册了 TCP 状态和数据回调，它本身不负责发起连接。
2.  **缺少触发连接的时机**：目前只有在 `fishControl.ts` 的 `sendCommand` 中，当需要发送指令且未连接时才会尝试连接。
3.  **无默认鱼**：应用刚启动（或刚登录）时，`currentFish` 可能为空，导致无法确定连接目标（IP/端口）。

### 修复方案
我们需要在登录成功后，自动加载默认机器鱼，并尝试发起连接。

1.  **修改 `src/renderer/src/views/login/index.vue`**：
    *   在登录成功逻辑中，先获取机器鱼列表。
    *   如果列表不为空，将第一条设为 `currentFish`。
    *   调用 `fishControlStore.connect()` 发起连接。

这样，一旦用户登录进入系统，程序就会自动连接到配置好的声通设备（即您的模拟器）。

### 执行步骤
1.  编辑 `src/renderer/src/views/login/index.vue`，引入 `useFishControlStore` 和后端 API。
2.  在 `submit` 函数的成功分支中，添加获取机器鱼列表、设置当前鱼、并发起连接的代码。
3.  完成后，您重新登录即可看到自动连接的效果。