# production | 接入真实应用
## limits | 限制轮数与预算
给普通 Query 配置 `maxTurns` 与 `maxBudgetUsd`，在消费端区分 `error_max_turns` 和 `error_max_budget_usd`。轮数限制不是把输入文本截短；取用 `duration_ms`、`num_turns`、`usage`、`modelUsage` 记运行指标。

预算判断依赖运行时知道的模型价格。有些环境变量发现的预置配置成本为零，因此 `total_cost_usd:0` 不能证明服务商不计费，也不能替代服务端账单或账号限额。
## context | 在发送前检查模型和上下文
创建 `run` 后调用 `await run.initializationResult()` 或 `await run.getContextUsage()`，可初始化会话和检查元信息，而不必先发一次模型请求。`supportedModels()`、`supportedCommands()` 与 `supportedAgents()` 可用于填选择列表。

不要每渲染一个控件就创建一个新 Query。只读元信息时最后也调用 `run.close()`；要继续发送就使用相同 Query 的正常消费流程。
## resources | 显式加载项目指令、技能或插件
默认不要假定服务器上的项目文件就是可信指令。用 `settingSources` 明确要加载的范围，用 `skills` 选技能。指定 `plugins:[{type:'local',path:'…'}]` 前检查本机插件来源；程序包不是无害的文档。

先用空目录和 `settingSources:[]` 运行基线，再一次只增加一个来源，在初始化信息查看技能、插件和命令。宿主已经拥有原生会话时，资源应在创建它的时候装配。
## hook | 在工具事件前后接入自己的逻辑
用 `options.hooks` 按事件注册回调，例如在 `PostToolUse` 记录必要的调用耗时，而不记录整份输入文件。需要日志投影时开启 `includeHookEvents`，从 `system/hook_response` 读执行结果。

选会发生的事件做一次小测试，区分模型失败和回调失败。带取消信号和超时运行，不要在钩子里无限等待 UI 授权；单次调用是否获准应使用[批准规则](../tools/approve.html)。
## host | 借用宿主已有的会话
如果服务已经创建了 `AgentSession`、管理历史并决定可用工具，就把**同一对**会话和 manager 交给 Query，而不是新建第二个写入者。以下可导入的函数保存为 `host.mts`：

```ts host.mts
import type { ModelRuntime } from "@zpi-dev/agent-sdk";
import {
  queryResult,
  type CreateAgentSessionResult,
} from "@zpi-dev/agent-sdk/host";
export async function askInHost(
  owner: CreateAgentSessionResult,
  runtime: ModelRuntime,
  prompt: string,
) {
  const { session, sessionManager } = owner;
  const result = await queryResult({
    prompt,
    options: { zpi: { session, sessionManager, modelRuntime: runtime } },
  });
  return result.result;
}
```

由宿主先配置 ModelRuntime，再调用 `createAgentSession`，在创建时确定工具、钩子和资源。不要在这层重复传公共的 `tools`、审批、轮数或预算选项。借用结束后由宿主 abort 活动并 dispose 自己的 session；公共 Query 不代为释放所有者。

# api | 开发接口速查
## query | query 参数与返回的 Query 对象
从主入口导入 `query({prompt,options})`。prompt 为字符串或异步用户消息流；返回的 Query 是异步生成器，用 `for await` 消费。表中的选项按目的查，不需要全填。

| 用途 | 字段 |
|---|---|
| 路径与模型 | `cwd`、`model`、`env`、`zpi.providers`、`zpi.modelRuntime` |
| 指令与推理 | `systemPrompt`、`thinking`、`effort`、`maxThinkingTokens` |
| 工具与权限 | `tools`、`allowedTools`、`disallowedTools`、`canUseTool` |
| 输出与观察 | `includePartialMessages`、`forwardSubagentText`、`includeHookEvents`、`outputFormat` |
| 控制运行 | `maxTurns`、`maxBudgetUsd`、`abortController` |
| 会话与镜像 | `persistSession`、`sessionId`、`title`、`resume`、`continue`、`forkSession`、`resumeSessionAt`、`sessionStore`、`sessionStoreFlush`、`loadTimeoutMs`、`enableFileCheckpointing` |
| 能力来源 | `agents`、`agent`、`plugins`、`skills`、`hooks`、`settingSources` |

想按任务找完整示例：先[只初始化不发送](../lifecycle/initialize.html)、[注册自有 provider](../models/provider.html)，或[关联用户消息 UUID](../lifecycle/identity.html)。

运行中可 `setModel()`、`setMaxThinkingTokens()`、`interrupt()`、`stopTask()`；检查状态用 `initializationResult()` 和 `getContextUsage()`。`close()` 和迭代器 `return()` 是释放方式，不是请求一条成功答案。
## messages | 消息、结果与错误字段
先按 `type` 缩小范围，再在系统或结果消息上判断 `subtype`。连续收到相同文字的三个视图不代表要显示三遍。

| 消息 | 读取方式 |
|---|---|
| `system/init` | `session_id`、模型和工具，绑定这次运行 |
| `stream_event` | 区分文本、推理和工具输入 delta |
| `assistant` / `user` | 完整内容块；`tool_use` 和 `tool_result` 按 ID 关联 |
| `system/task_started` / `task_notification` | 用后台 `task_id` 更新同一项 |
| `result/success` | `result`；配置结构化输出时读 `structured_output` |
| 失败 `result` | `errors` 数组、`subtype`，不要读取成功字段 |

`duration_api_ms` 与 `duration_ms` 不同；`permission_denials` 记录拒绝；`modelUsage` 按模型，`usage` 看汇总。直接抛出的异常不保证附这些字段。无结果时应单独报告未完成。
## tools | 工具名、审批和子智能体参数
SDK 原生名称区分大小写：`Read`、`Write`、`Edit`、`Bash`。`Glob` 与 `Grep` 在此版本是保留项，不能作为可用的搜索工具。应用自定义工具用 `defineTool` 注册实现并按名选入。

审批顺序：匹配拒绝 → 匹配预批准 → `canUseTool`（若无回调则允许）。回调 `null` 不会启动内置审批 UI。`hooks` 是生命周期回调；`agents` 条目可设 `description`、`prompt`、`tools`、`disallowedTools`、`model`、`maxTurns`、`effort`、`skills`。以 `system/init` 和实际工具记录核对装配结果。
## history | 会话函数、存储键与文件检查点
主入口提供 `listSessions`、`getSessionInfo`、`getSessionMessages`、`renameSession`、`tagSession`、`deleteSession`、`forkSession`。子任务用 `listSubagents` 和 `getSubagentMessages`；不要把消息 UUID 传给需要 sessionId 的方法。

本地查询范围用一致的 `dir` 与 `zpi.agentDir`。公共镜像键为 `{projectKey,sessionId,subpath?}`，实现 `append`、`load`，列表/摘要/删除/子项按需实现。`InMemorySessionStore` 适合测试适配器，不是重启后仍保留的数据库。文件检查点用 `rewindFiles`，不是删除历史 API。
## exports | 主入口、/host 和不支持的接口
主入口有 `query`、`defineTool`、`ModelRuntime`、会话管理函数、`InMemorySessionStore` 与类型。`/host` 才导出 `createAgentSession`、`SettingsManager`、`SessionManager`、`queryResult`、`nativeStopReason` 以及宿主的原生类型。

`queryResult(params, observe?)` 消费消息，返回最后一条成功终态。失败终态抛出的 Error 带 `sdkResult`；无终态也抛错但没有这个失败结果。`nativeStopReason` 是名称转换，不判断成功。索引式 `TranscriptStore` 与公共 `SessionStore` 不可互换。

按能力深入：[注册项目技能](../resources/skill.html)、[插件命令](../resources/plugin.html)、[镜像键与去重](../storage/keys.html)、[后台作业](../file-tools/background.html)、[子记录](../agents/transcripts.html)、[宿主存储](../host/ports.html)。

不要照搬其他 SDK 的 `permissionMode`、MCP、LSP 或 UI 参数。当前接口会校验不支持的选项；应该从[最小查询](../start/first.html)开始逐项增加，而不是把整个配置对象传进来。
