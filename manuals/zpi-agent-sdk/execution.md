# events | 把消息协议接到界面
## tool-pair | 把一次工具请求和响应画在同一行
一次调用至少涉及两条不同消息：`assistant.message.content` 中的 `tool_use` 提出请求；后续 `user.message.content` 中的 `tool_result` 交付执行结果。第二条虽然标成 user，却不是用户又发了一条聊天。界面应按调用 ID 配对，而非“把最新的结果填到最后一行”。

```ts timeline.mts
import type { SDKMessage } from "@zpi-dev/agent-sdk";
export type Row = { name: string; state: "执行中" | "成功" | "失败" };
export function record(rows: Map<string, Row>, m: SDKMessage) {
  if (m.type !== "assistant" && m.type !== "user") return;
  if (!Array.isArray(m.message.content)) return;
  for (const block of m.message.content) {
    if (block.type === "tool_use")
      rows.set(block.id, { name: block.name, state: "执行中" });
    if (block.type === "tool_result") {
      const row = rows.get(block.tool_use_id);
      if (row) row.state = block.is_error ? "失败" : "成功";
    }
  }
}
```

在[订单 CLI](../workshop/cli.html)的 `for await` 之前创建 `new Map<string,Row>()`，在循环最前面调用 `record(rows,m)`，在 result 到达时打印 `rows`。一条订单请求应该只留一行。同一轮同时调用 A、B 而 B 先结束时，只有 B 那一行先变色。追踪多个会话时再以 `session_id` 分区；不要仅按工具名配对。
## partial | 不把思考、工具参数或子任务文字错画成主回答
开启 `includePartialMessages:true` 后，先判断 `type==='stream_event'`，再判断 `event.type==='content_block_delta'`。只有 `delta.type==='text_delta'` 的 `text` 是增量正文。`thinking_delta` 是单独的内容类型；`input_json_delta.partial_json` 可能连合法 JSON 都还没拼完，不要在每个分片上解析执行。

主窗口再过滤 `parent_tool_use_id===null`。完整 `assistant` 消息到达时可用内容块替换临时渲染；最后 result 结算成功或失败，不再追加一次全文。用[可运行的流式渲染函数](../output/stream.html)验证一次回答只显示一遍。若已经显示过几个字随后失败，保留这些字并标失败，不把半条回答标成完成。
## result-helper | 只想 await 一个结果时，用 queryResult
`queryResult` 从 **`@zpi-dev/agent-sdk/host`** 导入；可以直接用于普通查询，并不要求先创建宿主。它消费整个流，返回最后一个成功终态，而不是返回字符串。失败终态抛 `Error`，并把原结果放进 `sdkResult`。初始化、观察者异常或完全没有 result 的流，不保证有这个属性。

```ts final-only.mts
import { queryResult } from "@zpi-dev/agent-sdk/host";
try {
  const m = await queryResult({
    prompt: "请简短问候",
    options: { model: "deepseek", tools: [], persistSession: false },
  });
  console.log("正文：", m.result);
} catch (e) {
  if (e instanceof Error && "sdkResult" in e)
    console.error("收到失败终态", e.message);
  else console.error("未能取得终态", e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
```

运行 `node final-only.mts`。单轮 API 很适合这个入口；聊天服务若采用持续不断的输入流，应每轮处理自己的 result，不能一直等“最后一个”。`nativeStopReason` 仅做名字转换，例如 `end_turn` 转成 `stop`、`null` 转成 `error`，不代替判断 `subtype`。
## failures | 区分四类失败终态和没有终态
| 你拿到什么 | 界面怎样处理 | 可以让用户做什么 |
|---|---|---|
| `error_max_turns` | 显示已达到循环上限与已执行步骤 | 缩小任务或明确提高下一次的上限 |
| `error_max_budget_usd` | 展示已有用量与本次预算 | 取得授权后再发新请求，不要自动重试 |
| `error_max_structured_output_retries` | 没有可采用的业务对象 | 检查 schema、输入和原始诊断 |
| `error_during_execution` | 从 `errors[]` 显示错误；取消也可能属于这类 | 区分请求失败、工具回调异常和主动停止 |
| 构造或迭代抛出 | 没有可依赖的终态字段 | 在 catch 处理配置、初始化、存储等错误 |
| 输入流为空或调用方关闭 | 没收到 result | 显示“没有完成”，不能推断成功 |

一项工具被拒绝并不必然导致整轮失败：助手可以根据拒绝返回解释，此时 `result/success` 仍可带 `permission_denials`。同理，输出不为空不保证业务操作成功。需要业务证据时核对工具结果或自己的数据。
## usage | 正确记录每轮 token、会话成本与预算
在多轮输入里，每条 result 的 `usage` 是本轮计数；`modelUsage` 按模型汇总，`total_cost_usd` 是会话累计，含恢复的历史。不能把每次收到的累计成本相加。恢复历史不会把旧花费算进**新 Query 的预算消耗**；子查询和父查询共享当前预算。

`maxTurns` 在下一次请求前检查，每条用户输入重新计轮数。`maxBudgetUsd` 也不是提供商硬限额：例如首请求实际花费超过预算，SDK 不能撤回已计费的请求，只能拦下一次。用有准确价格的模型配置验证，记录会话 ID、模型名、这次的 usage 和累计成本。不要向客户承诺 cost=0 就是免费。

# file-tools | 实际操作文件与命令
## read | 只给 Read，按行读取一个文件
在单独的练习目录放一份 `note.txt`，内容三行 `标题`、`蓝色`、`备注`。调用时设 `cwd` 为该目录、`tools:['Read']`，prompt 明确「用 Read 从 note.txt 的第二行读一行，返回读到的词」。工具输入是 `{file_path:'note.txt',offset:2,limit:1}`。offset 从 1 开始，不是字节数。

检查 init 只列出 Read，再看 `tool_use` 的 file_path 与对应 `tool_result`，不要仅凭最终答案出现“蓝色”。传绝对路径也可能读到目录之外；`cwd` 是解析相对路径的起点，不是权限边界。面对不可信输入，隔离进程或只开放受限的业务工具。
## edit | 想只改一行，为什么用 Edit 而不是 Write？
`Edit` 接收 `file_path`、`old_string`、`new_string`。先读当前文件，再提供足以唯一匹配的原文。指定的旧文本不存在或不唯一时应重新读取；只有确实要全替换才传 `replace_all:true`。`Write` 接收 `file_path` 和**完整的** UTF-8 `content`，会新建父目录或覆盖原文，不是追加。

在练习目录准备 `颜色：蓝\n保留：原样`。只选 `['Read','Edit']`，要求把蓝改红。验收不靠助手的“已更新”：读回文件，检查 `保留：原样` 没变。如果希望让用户撤销，**写之前**就要启用[检查点](../history/undo.html)。
## bash | 给一项前台命令设超时
只有需要程序执行命令时才选入 `Bash`。用 `command:'pwd'`、`description:'检查练习目录'`、`timeout:5000` 做无副作用冒烟测试。SDK 公共参数以**毫秒**计，上限 600000；平台需有可运行的 Bash。

在 `canUseTool` 对这次调用检查命令并作决定，内置 `Bash(...)` 模式只做字符串匹配，并不是 Shell 安全解析器。不要用“命令前缀像只读”来运行不可信用户提供的命令；生产环境用有限业务函数或受约束的进程。模型 key 和无关服务凭据不应暴露给命令进程。
## background | 跟踪后台任务，而不是一直轮询
允许后台命令时，模型传 `run_in_background:true`。返回的是 `task_id`，不是已经完成的输出。前端收到 `system/task_started` 建行，`task_progress` 更新那一行，`task_notification` 设为完成、失败或已停止。按 `task_id` 关联，工具调用 ID 留给工具记录。

需要让模型查看输出时选入 `TaskOutput`；`block:false` 立即查看，默认阻塞最多 30000ms，`timeout` 不是命令的运行期限。停止时用同一 Query 上的 `stopTask(id)` 或其 `TaskStop` 工具。**SDK 自管的单字符串查询会在本轮结束前收掉它拥有的任务**；要接跨轮任务面板，用保持存活的输入流，不要把它理解成脱离程序的系统作业服务。
## tool-errors | 工具返回业务错误、抛错和取消有何不同？
查不到订单可以返回 `{status:'not_found'}`，它是一次成功执行的业务结果；数据库连接断开则可抛异常，让工具运行器产生失败结果。`defineTool.execute` 可以是异步函数，第二个参数有 `signal` 和 `toolCallId`。把 signal 传给支持取消的 I/O，不要在用户取消后继续重试。

字符串原样包装为文本块，对象序列化为 JSON 文本；循环引用、BigInt、二进制响应都不宜直接返回。若要返回图像或进度，请使用原生 `ToolDefinition`，而不是假设简单包装器会处理所有类型。记录耗时和 `toolCallId` 即可，不把整份私有响应送到日志。

# policy | 工具权限与运行钩子
## order | 配置可见、预批准、拒绝时，谁先生效？
例如只想让助手查询订单，不要先开启一组文件工具再尝试用单个 allow 规则缩小范围。先用 `tools:['lookup_order']` 决定模型能提出什么；再用 `disallowedTools` 拒绝不能执行的调用，`allowedTools` 预批准明确无须询问的调用，剩余走 `canUseTool`。

| 配置 | 预期观察 |
|---|---|
| `disallowedTools:['Write']` | 排除整个工具，init 里不再列出它 |
| `disallowedTools:['Read(secret.txt)']` | Read 仍可见；匹配路径时拒绝，回调不会被叫到 |
| 同时匹配预批准与拒绝 | 拒绝优先，不执行工具 |
| 未匹配任何规则且没有回调 | 默认允许，不会出现内置审批弹窗 |

路径规则在 `cwd` 下解析并做模式匹配；不是操作系统沙箱。想把一次实际决定返回给 UI，看[可直接导入的审批函数](../tools/approve.html)。用拒绝分支做一次测试，确保业务文件确实没变。
## replacement | 批准前改写输入：缩短读取范围
假设用户允许读一份报表的前两行。不要在工具运行后才把大输出截短；在回调里返回 `updatedInput`，保留必填字段及原有结构。不要同时给 Read 预批准，否则回调不会被调用。

```ts cap-read.mts
import type { Options } from "@zpi-dev/agent-sdk";
export const capRead: NonNullable<Options["canUseTool"]> = async (
  name,
  input,
) => {
  if (name !== "Read" || input.file_path !== "public-note.txt")
    return { behavior: "deny", message: "本练习只批准 public-note.txt" };
  return {
    behavior: "allow",
    updatedInput: { file_path: "public-note.txt", offset: 1, limit: 2 },
  };
};
```

把函数传给 `canUseTool`，工具选择设成 `['Read']`。请求读取 50 行时，实际执行最多两行；路径不符应拒绝。这里是受控练习目录中的示范，不是对符号链接等文件系统边界的防护。改写后的参数仍需符合 Schema；返回 `null` 或非法对象会报错，不会触发外部等待队列。
## hooks | 写一条能观察到的生命周期钩子
钩子让**应用代码**跟随特定阶段运行，不要求模型记得去调用它。此例在每次接收输入时附一条上下文，并在会话结束时清理资源。保存后运行 `node hook.mts`：

```ts hook.mts
import { query, type Options } from "@zpi-dev/agent-sdk";
let accepted = 0,
  ended = 0;
const hooks: Options["hooks"] = {
  UserPromptSubmit: [
    {
      hooks: [
        async (input) => {
          if (input.hook_event_name !== "UserPromptSubmit") return {};
          accepted++;
          return {
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: "使用短句作答。",
            },
          };
        },
      ],
    },
  ],
  SessionEnd: [
    {
      hooks: [
        async () => {
          ended++;
          return {};
        },
      ],
    },
  ],
};
for await (const m of query({
  prompt: "介绍一本书",
  options: { model: "deepseek", tools: [], persistSession: false, hooks },
})) {
  if (m.type === "result" && m.subtype !== "success")
    throw Error(m.errors.join("; "));
}
console.log("收到输入 / 会话结束：", accepted, ended);
```

这个单轮自管查询应打印 `1 1`；要等迭代结束再检查 SessionEnd。输入字段是 `hook_event_name` 等 snake_case，返回值却用 `hookSpecificOutput.hookEventName`；两边的事件名必须一致。
## hook-fail | 选择匹配器、超时和钩子失败策略
对 `PreToolUse`/`PostToolUse` 组设置 `matcher:'^Read$'`，回调只处理目标工具；`timeout` 的单位是**秒**，与 Bash 的毫秒不同。回调收到 `signal`，取消或超时后应停止 I/O。只采集非必要指标时可用 `onFailure:'continue'`；必须通过的前置校验应使用 `'block'` 并验证失败时没有执行工具。

`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`Stop` 与工具/输入生命周期相连；`SessionEnd`、`SubagentStart/Stop`、`PreCompact/PostCompact` 用来观察其阶段，生命周期回调应返回空对象或仅 `continue:true`，不要假定它们都允许改写工具参数。`includeHookEvents` 用于在消息流里显示钩子投影，不代替实际注册回调。
