# query 的输入、选项与控制方法

这里查创建一次查询时该传什么，以及哪些操作属于返回的 `Query`。`query({ prompt, options? })` 返回异步生成器，不是 `Promise<string>`。

| 参数 | 接受内容与行为 |
| --- | --- |
| `prompt` | 字符串，或 `AsyncIterable<SDKUserMessage>`。流中 `type: "user"`、`message.role: "user"`；`content` 可为文字或含 text、base64 image 的块。指定的 `session_id` 必须匹配。虽然历史类型可容纳 `tool_result`，外部输入流注入此块会被拒绝 |
| `cwd`、`env`、`model` | 默认工作目录为 `process.cwd()`；环境、模型选择见[接入参考](setup.md)。目录不是安全边界 |
| `systemPrompt` | 字符串、字符串数组、custom 对象或 `claude_code` preset（可 `append`）。覆盖基础提示，不清除另行授权的资源/插件指令；预设是 ZPI 提示，不是 Anthropic 的私有提示 |
| `thinking`、`effort`、`maxThinkingTokens` | disabled/adaptive/enabled；强度 low、medium、high、xhigh、max。禁用或 0 表示 off，未指定时强度通常 medium；能否按预算或强度执行取决于模型协议 |
| `maxTurns`、`maxBudgetUsd` | 正整数轮数 / 正有限金额，在下一次模型请求前检查。后者依赖真实可用定价，不能保证单次请求不超支 |
| 工具与扩展 | `tools`、`allowedTools`、`disallowedTools`、`canUseTool` 见[工具参考](tools.md)；`agents`、`agent`、`hooks`、`plugins`、`skills`、`settingSources` 见[扩展参考](extensions.md) |
| 输出选项 | `includePartialMessages` 开增量；`includeHookEvents` 开常规钩子报告；`forwardSubagentText` 默认 false；`outputFormat: { type: "json_schema", schema }` 在 SDK 内解析并校验结果，最多三次尝试，不保证任意模型原生支持结构化输出 |
| 历史选项 | 默认持久化；`persistSession`、`sessionId`、`resume`、`continue`、`forkSession`、`resumeSessionAt`、`title`、`sessionStore`、`sessionStoreFlush`、`loadTimeoutMs`、`enableFileCheckpointing` 见[会话参考](sessions.md) |
| `abortController`、`zpi` | 可传自己的取消控制器。`zpi` 收纳宿主扩展：模型运行时/提供商/请求配置/传输、目录与项目键、工具/插件/资源加载器、借用会话及对应管理器、预处理输入和任务控制；不是任意配置转发口 |

**Query 上的方法。** `initializationResult()`、`supportedCommands()`、`supportedModels()`、`supportedAgents()` 返回当前实例的目录；`getContextUsage()` 是上下文读数，不是账单。`setModel(name?)`、`setMaxThinkingTokens(n | null)` 用于后续请求。`interrupt()` 停当前轮，`stopTask(id)` 针对单个子项，`close()` 不返回终态答案。`rewindFiles(userMessageId, { dryRun: true })` 只针对受跟踪写入。进入 `for await` 才开始消费并驱动查询。

构造阶段会拒绝不支持的顶层字段（如 `permissionMode`、MCP 配置）；不能因为其他 SDK 有同名 API 就当这里能用。默认不提供 LSP、权限弹窗、市场、远程会话或账号管理服务。想确认执行成功，接着查[终态与异常](results.md)。
