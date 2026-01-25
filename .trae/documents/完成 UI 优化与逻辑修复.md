我明白了问题所在。

在 `TopBar.vue` 中，虽然我们绑定了 `:class="{ active: fishControlStore.activeFishId === item.id }"`，但是由于 `fishControlStore` 是一个响应式 Store，而在模板中直接访问 `fishControlStore.activeFishId` 应该是没问题的。

但是，有可能 `activeFishId` 的响应性没有正确触发视图更新，或者 `item.id` 的类型与 `activeFishId` 不一致（例如一个是数字一个是字符串）。

### 排查与修复
1.  **类型检查**：确认 `item.id` 和 `activeFishId` 是否类型一致。`item.id` 来自 `allFishStatus` 计算属性，而 `activeFishId` 是 Store 中的 Ref。
2.  **强制响应**：我们可以尝试创建一个 computed 属性来明确返回当前的 activeId，或者在 setup 中解构出来。

**更可能的原因**：
在之前的修改中，我可能不小心把 `switchFish` 函数的实现搞得太复杂或者没有正确触发 Store 更新。
但最重要的是，我在 CSS 中定义的 `.active` 样式可能被其他样式覆盖了，或者没有正确生效。

我将：
1.  检查 CSS 优先级。
2.  在模板中显式打印一下 ID，确认是否匹配。
3.  确保 `switchFish` 确实修改了 `activeFishId`。

（其实我看代码逻辑是对的，可能是 CSS 问题。之前的 CSS 是：
```css
            &.active {
                background: rgba(64, 158, 255, 0.15);
                border-left: 3px solid #409eff;
                padding-left: 13px;
            }
```
如果这个样式在 `scoped` 中，而 `list-item` 也在同一作用域，应该没问题。但我注意到之前我是把样式放在了 `style lang="scss"` (非 scoped) 的 `.connection-popover` 下。

### 修正计划
我将再次检查并强化 `.active` 的样式，确保它在选中时有明显的视觉变化。同时，我会确认点击事件是否真的触发了 Store 的更新。

**关键点**：您说“选中没变”，是指**下拉列表里的高亮行没有变**，还是**顶部按钮显示的名称没有变**？
如果是前者，那是 CSS/绑定问题。
如果是后者，那是 `currentFish` 没有更新。

根据上下文，您应该是说**下拉列表里的高亮**。我会重点修复这个。