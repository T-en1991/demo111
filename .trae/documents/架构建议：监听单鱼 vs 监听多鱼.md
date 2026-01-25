您现在的系统在主进程（Backend）其实已经支持多鱼并发连接，限制主要在渲染进程（Frontend）的 `fishControlStore` 中——它目前设计为**单实例模式**，同一时间只能维护一条鱼的状态和连接。

要实现**多鱼同时监听**（即您可以在多条鱼之间切换，而后台所有鱼都保持在线、持续接收数据），我们需要对 `fishControlStore` 进行一次较大的重构。

### 核心重构计划

#### 1. Store 状态结构升级
从“单一变量”升级为“映射表（Map）”，以支持同时存储多条鱼的数据。
*   **旧结构**：
    *   `currentFish`: 当前选中的鱼
    *   `currentStatus`: 当前鱼的状态
    *   `connectionStatus`: 当前鱼的连接状态
*   **新结构**：
    *   `activeFishId`: 当前界面选中的鱼 ID（用于 UI 显示）。
    *   `fishMap`: `Map<number, Fish>` 缓存所有已加载的机器鱼配置。
    *   `fishStates`: `Map<number, FishTelemetry>` 存储每条鱼的实时状态（深度、坐标等）。
    *   `connectionStates`: `Map<number, string>` 存储每条鱼的连接状态（connected/disconnected）。
    *   `fishLogs`: `Map<number, string[]>` 存储每条鱼的日志。

#### 2. 连接管理逻辑变更
*   **去除“切鱼即断开”**：在 `setCurrentFish`（或 `setActiveFish`）时，**不再**主动断开旧鱼的连接。
*   **批量连接/管理**：提供 `connect(fishId)` 方法，允许对任意一条鱼发起连接，而不仅仅是当前选中的那条。
*   **智能路由**：监听器收到 TCP 数据（带有 IP/Port）时，需要遍历所有已知的机器鱼配置，找到匹配的 `fishId`，然后更新对应的 `fishStates[id]`。

#### 3. 界面交互调整
*   **列表页/侧边栏**：可以实时显示所有鱼的在线状态小绿点（因为状态都在 Store 里了）。
*   **详情页**：切换不同鱼时，直接从 Store 的 `fishStates` 中读取数据，无缝切换，无需重新连接。

### 实施步骤
1.  **重构 `store/fishControl.ts`**：
    *   引入 Map 结构存储多鱼状态。
    *   修改 `initListeners`，使其能根据 IP/Port 反向查找鱼 ID 并分发数据。
    *   保留 `currentFish` / `currentStatus` 作为计算属性（指向 `activeFishId` 对应的数据），以兼容现有的 UI 组件，减少对视图层的修改。
2.  **更新 `views/fish/index.vue`**：
    *   保存配置时，更新 Store 中的缓存。
3.  **验证**：
    *   启动多条鱼（或多个模拟器端口）。
    *   分别连接，确认能同时收到数据。
    *   切换视图，确认连接不中断。

这个改动能让您的系统从“单机控制器”进化为“多机监控中心”，非常合理且必要。确认后我将开始执行代码重构。