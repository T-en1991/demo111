已完成修复。

### 修复内容
1.  **导航点精度调整**：
    *   在 `/src/renderer/src/views/screen/index.vue` 中，将导航设置弹窗（`navigateDialogVisible`）内的经度（lon）和纬度（lat）输入框的精度从 4 位小数调整为 **6 位小数**（`:precision="6"`, `:step="0.000001"`）。
    *   这确保了在 Screen 页面进行导航规划时，也能输入高精度的坐标点。

2.  **代码逻辑修复**：
    *   在 `screen/index.vue` 中补充了 `currentFish` 的定义（通过 `computed` 从 store 获取），修复了模板中可能因 `currentFish` 未定义而导致的潜在错误。

现在，无论是在“机器鱼管理”页面还是“屏幕监控”页面的导航设置中，经纬度都已统一支持 6 位小数精度。