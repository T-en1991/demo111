## 目标
- 修改图片接收完成后的处理逻辑（`handleCompleteImageData`）。
- 现有逻辑是列出最近 100 条 `fromSocket: true` 的告警并尝试匹配。
- 需求：改为直接根据 `filename`（从图片帧解析出的名字）查找对应的 Alert 记录，并将图片关联到该 Alert。

## 实现逻辑
- 在 `src/main/ipc/serial.ts` 的 `handleCompleteImageData` 函数中：
  1. 接收 `filename` 参数。
  2. 使用 `filename` 在 `Alert` 表中查找匹配的记录。
     - 匹配规则：`imgFile` 字段包含该 `filename`（因为 `imgFile` 可能是完整路径）。
     - 或者如果 `Alert` 有专门存文件名的字段，则直接匹配。目前看 `imgFile` 是最可能的关联点。
     - 如果找不到匹配的 Alert，可能需要创建一个新的 Alert 或者记录日志（根据业务需求，通常是关联已有告警）。
  3. 找到 Alert 后，更新其 `imageBase64` 或保存图片文件并更新 `imgFile`（如果尚未保存）。
  4. 现有逻辑是保存图片文件并更新 `imgFile`，这部分保持不变，只是查找 Alert 的方式变了。

## 变更文件
- `src/main/ipc/serial.ts`：修改 `handleCompleteImageData` 中的 Alert 查找逻辑。
- `src/main/database/index.ts`（可选）：如果在 `alertService` 中没有直接按文件名查找的方法，可能需要新增一个 `findByFilename` 或类似方法。目前可以用 `prisma.alert.findFirst({ where: { imgFile: { contains: filename } } })`。

## 验证
- 发送带文件名的图片帧。
- 确认系统能找到对应的 Alert（预先存在的 Alert，其 `imgFile` 应包含该文件名）并更新图片。

确认后我将修改查找逻辑。