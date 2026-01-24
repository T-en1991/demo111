我将修复 `npm run dev` 运行时的报错，主要涉及以下文件：

1.  **`src/renderer/src/views/fish/index.vue`**:
    *   修复属性访问错误：`row.code` -> `row.fishCode`，`row.microwavePort` -> `row.serialBaudRate`。
    *   修正类型定义 `FishFromBackend` 以匹配后端返回的新结构。
    *   修复 ESLint 格式警告。

2.  **`src/preload/index.ts` 和 `src/preload/index.d.ts`**:
    *   更新 `fish.create` 和 `fish.update` 的参数定义，将旧字段 (`deviceId`, `microwaveIp` 等) 替换为新字段 (`acousticId`, `serialPortPath` 等)。
    *   确保 `window.api` 的类型定义与实际 IPC 调用一致。

3.  **`src/main/ipc/serial.ts`**:
    *   将 `require` 替换为 `import` 以符合 TypeScript 规范。
    *   修复 ESLint 格式警告。

4.  **`src/renderer/src/store/fishControl.ts`**:
    *   修复 TypeScript 类型错误（移除不必要的 `any`）。
    *   清理未使用的变量。

5.  **`src/main/database/index.ts`**:
    *   添加缺失的函数返回类型。
    *   修复 ESLint 格式警告。

修复完成后，您将可以正常运行 `npm run dev`。