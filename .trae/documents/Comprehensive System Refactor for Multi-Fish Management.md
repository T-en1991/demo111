# 系统改造计划 (修订版)

收到您的反馈，保持 `id` 自增不变。为了满足您“手动输入ID作为通信依据”的需求，我将在数据库中新增一个字段（如 `deviceId`）来存储这个手动输入的ID。

## 1. 数据库与后端修改 (Database & Backend)
### 数据库 Schema (`schema.prisma`)
*   **Fish 表**:
    *   `id`: **保持不变** (自增主键)。
    *   **新增 `deviceId`**: Int, @unique，作为界面上显示的“机器鱼ID”，用于通信标识和手动输入。
    *   新增 `showOnMap`: Boolean，默认 true，控制地图显示。
    *   新增 `initialLon`: Float (7位精度)，初始经度。
    *   新增 `initialLat`: Float (7位精度)，初始纬度。
*   **Video 表**: 新增 `fishId` 字段 (关联 Fish 表主键)。
*   **History 表**: 新增 `fishId` 字段 (关联 Fish 表主键)。

### 后端服务 (`src/main/database/index.ts` & IPC)
*   **Fish Service**: 支持 `deviceId`, `showOnMap`, `initialLon`, `initialLat` 的增删改查。
*   **Video/History Service**:
    *   导入/创建时接收 `fishId` 并存储。
    *   查询时支持按 `fishId` 过滤。

## 2. 前端页面修改 (Frontend Views)

### A. 登录页面 (`login/index.vue`)
*   **移除**: 删除选择机器鱼的逻辑。
*   **逻辑**: 登录后直接跳转首页。

### B. 鱼管理页面 (`fish/index.vue`)
*   **列表**: 增加展示 `deviceId` (显示为 ID)、`showOnMap` (地图显示)。
*   **新增/编辑弹窗**:
    *   **ID 输入框**: 绑定到 `deviceId` 字段，数字输入。
    *   **地图显示**: Switch 开关。
    *   **初始经纬度**: 数字输入，保留7位小数，不足补0。

### C. 上传页面 (`upload/index.vue`)
*   **新增**: 选择鱼下拉框（显示名称和 `deviceId`）。
*   **逻辑**: 上传/导入时将选中的 `fishId` 传给后端。

### D. 历史与报警页面 (`history/index.vue`, `alerts/index.vue`)
*   **筛选**: 增加鱼筛选下拉框。
*   **逻辑**: 按选中的鱼过滤数据。

### E. 大屏/地图页面 (`screen/index.vue`)
*   **交互重构**:
    *   **默认选中**: 自动选中列表第一条。
    *   **头部切换**: 下拉切换选中鱼。
    *   **地图点击**: 仅切换选中状态，**无弹窗**。
*   **地图展示**:
    *   **样式**: 选中鱼=绿色+高亮；其他=灰色。
    *   **标签**: 显示鱼名称。
    *   **位置**: 综合 `updatedAt` 和 `History` 最新时间。
*   **功能**:
    *   **实时视频**: 地图界面增加按钮，点击查看选中鱼视频。
    *   **侧边栏**: 显示选中鱼信息。

## 3. 执行顺序
1.  **Schema 变更**: 添加 `deviceId` 等字段并迁移。
2.  **后端更新**: 适配新字段逻辑。
3.  **前端页面**: 依次完成 登录 -> 鱼管理 -> 上传 -> 历史/报警 -> 大屏 的重构。
