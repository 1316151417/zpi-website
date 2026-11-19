# /host 入口：借用原生会话与取得最终结果

如果你只在一个脚本中问一次问题，用主入口 `query` 即可。已有自己的索引存储、会话服务或事件订阅时，才需要这里的所有权合同。

## 公开导出

`@zpi-dev/agent-sdk/host` 的运行时导出是 `createAgentSession`、`SessionManager`、`SettingsManager`、`queryResult`、`nativeStopReason`。另导出 `AgentSession`、`CreateAgentSessionOptions`、`CreateAgentSessionResult`、`ResourceLoader`、`ToolDefinition`、`SessionPlugin`、`TranscriptStore`、`SessionCurrentState`、历史条目/快照及输入/上下文类型。`ModelRuntime` 和 `query` 来自**主入口**。不要从内部包导入未公布的类。

## 驱动已经创建好的会话

下面是可直接导入宿主的函数。参数是调用方持有的 `createAgentSession` 返回值与创建时使用的已配置运行时；函数不负责新建或销毁它们。

```ts
import { type ModelRuntime } from "@zpi-dev/agent-sdk";
import { queryResult, type CreateAgentSessionResult } from "@zpi-dev/agent-sdk/host";

export async function askInHost(owner: CreateAgentSessionResult, runtime: ModelRuntime, prompt: string) {
  const answer = await queryResult({
    prompt,
    options: { zpi: { session: owner.session, sessionManager: owner.sessionManager, modelRuntime: runtime } },
  });
  return answer.result;
}
```

1. 宿主先配置模型，再 `await createAgentSession({ cwd, modelRuntime, sessionManager, … })`。也可传 `storage: { transcript, currentState }`，由返回值给出相配的 manager；这与传入 `sessionManager` 互斥。`SettingsManager` 管原生设置，不是外部 transcript 镜像。
2. **在创建处**确定工具、钩子与循环策略（例如 `noTools: "all"`、`beforeModelRequest`）。借入层不能再传 `tools`、`allowedTools`、`disallowedTools`、`canUseTool`、`hooks`、`maxTurns` 或 `maxBudgetUsd`。借入的 session ID 必须与 manager 一致，并传对应运行时。
3. 若需要预处理输入可给 `zpi.input`；需要程序按 ID 停原生后台任务可给 `zpi.taskControl`。只结束公共 Query 不会 dispose 宿主会话；宿主最终应自己停止活动、释放订阅并 dispose。不要叠加公共 `sessionStore`。

## queryResult 与停止原因 {#result-helper}

`await queryResult(params, observe?)` 遍历查询，可选观察每条 `SDKMessage`，取**最后一个** `result`。成功返回有 `result` 字段的消息；失败结果抛 `Error`，其 `sdkResult` 是原失败消息；无结果也抛错。初始化、迭代或观察者抛出的异常不保证带 `sdkResult`。多轮流中若需逐轮结算，不要只等最后一次，改用 `query`。

`nativeStopReason` 把 `end_turn`→`stop`、`tool_use`→`toolUse`、`max_tokens`→`length`，`null`→`error`，其他字符串原样返回。它是命名适配，不是成功判定。要比较宿主索引与公共镜像，接着看[会话所有权](../explanation/ownership.md)。
