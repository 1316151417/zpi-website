# 给 UI 接上停止、关闭和按 ID 停止后台任务

用户点了停止，通常还要看到这轮为什么结束。不要在所有按钮里都调用 `close()`，它会结束消费而不是交付一条成功答案。

1. 创建 `const run = query({ prompt, options })` 后保存这个对象，启动唯一的 `for await` 消费循环。在运行中的取消按钮里 `await run.interrupt()`；继续消费，显示中断或失败结果，保留已显示内容。该版本返回 `undefined`，不要从它读排队消息数组。
2. 若收到 `system/task_started`，保存 `task_id` 并关联 `session_id`、`tool_use_id`。要**只停止后台子项**，对其所属的 Query 调 `await run.stopTask(taskId)`，以相同任务的 `task_notification` 为终态。不要混用消息 UUID、工具调用 ID 与后台 ID。
3. 页面卸载或服务关闭时，用 `run.close()` 放弃这个 Query，不再等一个可展示的 result；`await run.return()` 可等待迭代清理。整个请求树需要共享取消时，可事先传 `abortController`。关闭不会回滚已经执行的外部写入。
4. 还没开始生成，只想读元数据？`await run.initializationResult()`、`await run.getContextUsage()` 可初始化会话但不需要先发送模型请求；用完也要释放 Query。已关闭的查询不能再用来控制后台任务。

检查按钮绑定：停止一项任务不应让另一个 ID 变成已停止。借入宿主会话且未提供 `zpi.taskControl` 时，`stopTask` 会明确报不支持，不应伪装成成功。相关差异见[谁拥有会话](../explanation/ownership.md)。
