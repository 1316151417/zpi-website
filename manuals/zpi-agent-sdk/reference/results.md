# 怎样判断查询成功、失败，还是根本没拿到结果

读到了助手文字，**还不能**标记任务成功。按下面的顺序收窄消息；不用靠字符串内容或假定「最后一条一定是答案」。

## 先判断结果，再判断分支 {#decision}

| 条件 | 可以读什么 | 调用方应做什么 |
| --- | --- | --- |
| `m.type !== "result"` | 初始化、用户回显、工具、助手或增量等事件 | 更新界面，不结算本轮 |
| `m.type === "result" && m.subtype === "success"` | `m.result: string`、`is_error: false`；请求 JSON schema 时有 `structured_output` | 接受成功；如果业务不允许空回答或还要查证，另加业务校验 |
| `m.type === "result"` 且 subtype 不是 success | `m.errors: string[]`、`is_error: true` | 记录 subtype、错误和会话 ID；不去取成功字段 |
| `query(...)` 或迭代直接 throw，或流结束而没收到预期结果 | 没有可依赖的 result | 创建和遍历一起放进 try/catch；区分取消/主动关闭与真正的初始化、存储或协议异常 |

错误 subtype 为 `error_during_execution`、`error_max_turns`、`error_max_budget_usd`、`error_max_structured_output_retries`。`stop_reason`（如 `end_turn`、`tool_use`、`max_tokens`，或错误诊断）**不是**成功判定。收齐错误后再决定是否重试：重复请求可能重复真实工具副作用。

## 事件速查 {#events}

| 类型 | 识别与使用 |
| --- | --- |
| `system/init` | `session_id`、`cwd`、`tools`、`model` 等，表示已初始化。`mcp_servers: []`、`claude_code_version` 等是兼容形状，不表示安装/连接了 Claude Code 或 MCP |
| `user` | 用户回显或工具结果；`tool_use_id` 对应一次调用，`uuid` 用于消息身份，不能用相同文本推断同一消息 |
| `assistant` | 本次模型消息的完整 `message.content`，可混合 `text`、`thinking`、`tool_use`；一次用户输入可以经历多次模型消息 |
| `stream_event` | 开增量后有 message_start/stop、content_block_start/delta/stop、message_delta；只展示 `text_delta.text` 作为正文，不展示未拼完的工具参数当结论 |
| `system/hook_response`、`compact_boundary`、`mirror_error` | 钩子状态、压缩边界、外部镜像失败；不要把镜像告警当作本轮模型错误，也不能忽略未保存历史的风险 |
| `system/task_started`、`task_progress`、`task_notification` | 后台开始、进度、终态，以任务和调用 ID 关联。转发的子智能体正文可用 `parent_tool_use_id` 与主回复区分 |

结果还含 `session_id`、`uuid`、`duration_ms`、`duration_api_ms`、`num_turns`、`permission_denials`。`usage` 计本轮主循环；`total_cost_usd` 和按 `provider/model` 分组的 `modelUsage` 是会话累计，可含子任务。恢复的历史不消耗新 Query 的金额预算。用量缺失或价格为零时不要据此反推服务端账单。

要抄一段完整的分支代码，见[首次查询](../tutorial/first-query.md)；只要最后一个成功结果，见[queryResult](host.md#result-helper)。
