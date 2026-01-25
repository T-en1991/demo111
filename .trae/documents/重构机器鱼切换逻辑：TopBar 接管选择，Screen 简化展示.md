这是一个很好的 UI 结构调整，将“机器鱼选择/切换”的职责完全上移到 TopBar，而 Screen 页面则专注于展示当前选中鱼的详情。

### 实施计划

#### 1. Screen 页面 (`src/renderer/src/views/screen/index.vue`)
*   **移除下拉框**：删除原有的 `ElSelect` 机器鱼选择器。
*   **改为静态标题**：在原位置显示“基础信息”文字（或者显示当前鱼的名称，作为该信息区块的标题）。
*   **依赖调整**：确保页面数据依然响应全局 `fishControlStore.currentFish` 的变化（目前已经是响应式的，所以只需改 UI）。

#### 2. TopBar 组件 (`src/renderer/src/components/TopBar.vue`)
*   **功能增强**：现在的 TopBar 已经有了“显示当前鱼”和“管理连接”的功能。为了支持“切换当前鱼”，我们需要在 Hover 下拉列表中增加**点击切换**的交互。
*   **交互逻辑**：
    *   在下拉列表的每一行（机器鱼列表项）增加点击事件。
    *   点击某一行时，调用 `fishControlStore.setCurrentFish(fish)`，将全局焦点切换到该鱼。
    *   **视觉反馈**：高亮显示当前选中的鱼。

### 具体步骤
1.  **修改 Screen 页**：删除 Select 组件，替换为 Text。
2.  **修改 TopBar 页**：
    *   在 `connection-list` 的 `list-item` 上添加 `@click` 事件。
    *   在 `fishControlStore` 中确保 `setCurrentFish` 正常工作（已验证）。
    *   为当前选中的项添加 `active` 样式类，以便用户知道当前看的是哪条鱼。

这样改动后，TopBar 就成了真正的“全局控制中心”，负责切换视角和管理连接；而 Screen 页则成为纯粹的“数据展示面板”。确认后我将开始执行。