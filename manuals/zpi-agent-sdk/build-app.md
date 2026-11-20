# start | 运行第一个程序
## first | 从空目录到第一条回答
需要 Node.js 24.x、npm 和能调用 DeepSeek API 的账号。示例只发一条问题，不给模型工具、不保存会话。真实运行可能收费；它不会像官网演示一样保证一秒或固定回复。

### 准备项目
在一个新目录运行 `npm init -y`，再运行 `npm install @zpi-dev/agent-sdk`。在运行 Node 的环境中设置 `DEEPSEEK_API_KEY`；不要把密钥放在 `.mts` 文件、浏览器或提交记录里。Mac 的 zsh 可用 `read -rs 'DEEPSEEK_API_KEY?API Key: '; echo; export DEEPSEEK_API_KEY`。

### 保存为 first-query.mts
```ts first-query.mts
import { query } from "@zpi-dev/agent-sdk";

try {
  let terminal = false;
  const run = query({
    prompt: "用一句话介绍你能帮我做什么。",
    options: { model: "deepseek", tools: [], persistSession: false },
  });
  for await (const message of run) {
    if (message.type !== "result") continue;
    terminal = true;
    if (message.subtype === "success") console.log("成功：", message.result);
    else {
      console.error("失败：", message.subtype, message.errors);
      process.exitCode = 1;
    }
  }
  if (!terminal) throw new Error("没有收到终态结果");
} catch (error) {
  console.error("查询异常：", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
```

### 运行并检查
运行 `node first-query.mts`。看到“成功：”和回答即可，不必比对某句问候语。若出现 `Model is not configured`，检查变量是否设置在同一终端。若“失败：”后是错误子类型，查询确实交付了失败结果，和还未得到结果就抛错不同。
想把它变成给别人使用的程序？继续做[订单助手 CLI](../workshop/cli.html)，从返回一句回答走到可以核对的实际业务结果。

## credentials | 接入自己的模型和凭据
`model: 'deepseek'` 按已注册提供商选取它的模型。要固定具体版本，选 `provider/model` 而非可能重名的裸 ID。凭据默认从进程环境发现；传 `options.env` 时要确保其中确实包含所需变量。

自定义服务用 `zpi.providers` 注册协议、Base URL、凭据和模型定义，再用注册名/模型 ID 查询。若已经自行创建 `ModelRuntime`，应把它配置好后传入，不能指望 SDK 再自动为这个运行时补注册环境变量里的服务商。
## environment | 选择运行环境，验证安装
在 Node.js 服务或脚本里从 `@zpi-dev/agent-sdk` 导入；宿主相关能力才从 `@zpi-dev/agent-sdk/host` 导入。Windows 可使用 SDK；启用 Bash 工具另需系统里真实可用的 Bash。

运行 `npm ls @zpi-dev/agent-sdk` 看实际版本，再运行第一个无工具查询。能导入包与能完成模型鉴权是两次不同检查。不要把服务器密钥打包给前端用户。

# output | 把回答交给应用
## final | 只取最终答案：处理成功、失败和抛错
`query()` 给你一个异步迭代器，不是一段字符串。读取到 `type === 'result'` 后再判断 `subtype`：只有 `success` 有 `result` 正文；失败分支读 `errors`，例如轮数耗尽、执行错误或预算超限。

把**创建和迭代**都放在 try/catch 内。配置无效或初始化失败可能直接抛错；主动关闭或空输入流还可能结束而没有 result。给 UI 保留这三条路径，别把“循环结束”当作成功。[首个程序](../start/first.html)可直接作为实现。
## stream | 边生成边显示，不重复打印全文
在同一项目保存 `stream.mts`。下列函数只显示主任务的文本增量，返回经过终态确认的完整回答，调用方可以用它替换临时显示，而不是再追加一次。

```ts stream.mts
import { query, type Options } from "@zpi-dev/agent-sdk";
export async function showTurn(prompt: string, options: Options) {
  let final: string | undefined;
  const run = query({
    prompt,
    options: { ...options, includePartialMessages: true },
  });
  try {
    for await (const msg of run) {
      if (msg.type === "stream_event" && msg.parent_tool_use_id === null) {
        const ev = msg.event;
        if (
          ev.type === "content_block_delta" &&
          ev.delta.type === "text_delta"
        )
          process.stdout.write(ev.delta.text);
      }
      if (msg.type === "result") {
        if (msg.subtype !== "success") throw Error(msg.errors.join("\n"));
        final = msg.result;
      }
    }
  } finally {
    run.close();
  }
  if (final === undefined) throw Error("未收到结果");
  return final;
}
```

在同目录的 `.mts` 中调用 `await showTurn('你好', {model:'deepseek', tools:[], persistSession:false})`，记得从 `./stream.mts` 导入。工具输入的 JSON 增量和推理块都不是正文；不要把它们一起追加。
## structured | 用 JSON Schema 接收结构化结果
例如要把反馈分为 bug 或 idea，传 `outputFormat: {type:'json_schema', schema:{type:'object', properties:{kind:{enum:['bug','idea']}}, required:['kind'], additionalProperties:false}}`，同时在 prompt 给出原始反馈和分类目标。

在已完成入门的目录保存为 `structured.mts`，运行 `node structured.mts`：

```ts structured.mts
import { query } from "@zpi-dev/agent-sdk";
const schema = {
  type: "object",
  properties: { kind: { enum: ["bug", "idea"] } },
  required: ["kind"],
  additionalProperties: false,
};
for await (const m of query({
  prompt: "提交反馈：点击保存没有反应。请分类。",
  options: {
    model: "deepseek",
    tools: [],
    persistSession: false,
    outputFormat: { type: "json_schema", schema },
  },
})) {
  if (m.type !== "result") continue;
  if (m.subtype !== "success") throw Error(m.errors.join("\n"));
  console.log("分类：", m.structured_output);
}
```

消费到成功终态后从 `structured_output` 取值；它不是可以不验类型就写数据库的业务对象。失败时处理 `error_max_structured_output_retries` 等结果，不要从半截流式 JSON 中猜一个分类。
## interrupt | 给当前回复接上停止按钮
创建 Query 后保留同一个 `run` 引用；一个循环负责消费消息，停止按钮调用 `await run.interrupt()`。继续消费，让 UI 展示已输出的文字及实际结束状态。本版 interrupt 返回 `undefined`，不是待发消息列表。

不要在停止按钮里重新构造 query，那样取消的是另一个对象。中断不会撤销工具产生的文件修改或外部请求。
## close | 用户离开页面时释放查询
如果不再需要最后一条消息，用 `run.close()` 放弃查询；要等待迭代器清理，用 `await run.return()`。多个操作共享取消信号时，在创建时传 `abortController`。

用户点停止还要看本轮结论时用 interrupt，不是 close。只初始化元信息不消费回复的 Query 也要释放。对于借入的会话，最终销毁原生 session 仍归宿主负责。

# tools | 工具与授权
## expose | 从没有工具开始，只开放需要的能力
纯问答显式传 `tools: []`。需要读取文件时才改为 `tools: ['Read']` 并给 `cwd` 指定练习目录；先读一份无敏感内容的测试文件。用初始化消息里的 `tools` 核对模型看得见什么。

`allowedTools` 是预批准，不是工具可见性白名单。也不要把工作目录当作 OS 沙箱。要求只读时，不要顺手给能写文件的 Bash；真正隔离依赖运行进程的权限。
## define | 写第一个自定义工具：查订单状态
为模型提供一个小而明确的查询，比让它猜订单状态可靠。先运行 `npm install typebox@1.3.27`，将下文保存为 `order.mts`，不要换成真实客户数据。

```ts order.mts
import { query, defineTool } from "@zpi-dev/agent-sdk";
import { Type } from "typebox";
const lookup = defineTool({
  name: "lookup_order",
  description: "按编号查练习订单",
  parameters: Type.Object({ id: Type.String({ minLength: 1 }) }),
  execute({ id }, { signal }) {
    signal?.throwIfAborted();
    return { status: id === "42" ? "已发货" : "未知订单" };
  },
});
let used = false;
for await (const m of query({
  prompt: "请用 lookup_order 查订单 42，再回答状态。",
  options: {
    model: "deepseek",
    persistSession: false,
    tools: [lookup.name],
    zpi: { customTools: [lookup] },
  },
})) {
  if (m.type === "assistant")
    used ||= m.message.content.some(
      (b) => b.type === "tool_use" && b.name === lookup.name,
    );
  if (m.type === "result") {
    if (m.subtype !== "success") throw Error(m.errors.join("\n"));
    console.log(used ? "模型调用了工具" : "未观察到调用", m.result);
  }
}
```

运行 `node order.mts`。`customTools` 注册实现，`tools` 选入本轮可见集合。只有看到了工具调用才能证明调用发生；真实模型也可能跳过工具，不能只凭回答含“已发货”验收。
## approve | 在真正执行前要求批准
用 `tools` 缩小可见集合，再用 `canUseTool` 审批调用。回调检查名称、输入、requestId 和取消信号，返回 `{behavior:'allow'}` 或 `{behavior:'deny',message:'用户取消'}`；需要改参数可在批准时返回 `updatedInput`。

例如，下面是可以直接在 `options` 中使用的审批函数。`confirmRead` 由调用方提供；用户取消、没有可用界面或回调超时都不默许执行。

```ts approval.mts
import type { Options } from "@zpi-dev/agent-sdk";
export function approveRead(
  confirmRead: (path: string, signal: AbortSignal) => Promise<boolean>,
): NonNullable<Options["canUseTool"]> {
  return async (name, input, { signal }) => {
    if (
      name === "Read" &&
      typeof input.file_path === "string" &&
      (await confirmRead(input.file_path, signal))
    )
      return { behavior: "allow" };
    return { behavior: "deny", message: "未获用户批准" };
  };
}
```

匹配 `disallowedTools` 的拒绝优先；匹配 `allowedTools` 会跳过回调直接预批准。不匹配且没有回调时默认放行。因此“我只写了一项 allowedTools”不等于其他工具禁止执行。可在终态的 `permission_denials` 对照被拒调用。
## agents | 把独立调查交给子智能体
在 `options.agents` 用稳定名称定义角色，写明 description、prompt，并限制它自己的工具、模型和轮数。让父查询有可用的委派能力，再提出有验收条件的小任务。不要把多个普通 query 并发误当作自动存在的父子关系。

例如在 `options` 中放入 `tools:['Agent'], agents:{reviewer:{description:'核对给定文本中的数字',prompt:'只比较传入的数字并列出差异',tools:[],maxTurns:2}}`。主提示提供待核对的两段文本，要求委派给 reviewer；子角色不需要本机工具。

观察父任务的工具调用和 `system/task_started`。希望显示子任务文字时设置 `forwardSubagentText`，按 `parent_tool_use_id` 区分，不要把子项增量拼成主任务答案。
## stop-task | 只停止选中的后台任务
收到 `system/task_started` 时保存 `task_id`、所属 `session_id` 和工具调用 ID。用户点停止这一项时，在所属 Query 上调用 `await run.stopTask(taskId)`，按同一 ID 的 `task_notification` 更新列表。

`task_id` 不是消息 UUID。其他行应保持原状；宿主借入路径没有配置 `zpi.taskControl` 时会报不支持，不能向用户显示“已停止”。

# sessions | 延续和保存对话
## follow | 在同一 Query 里追问
传入 `AsyncIterable<SDKUserMessage>` 作 prompt，而不是两次调用 `query({prompt:'…'})`。每次 yield 一个 `{type:'user',parent_tool_use_id:null,message:{role:'user',content:'…'}}`，保持一个输出消费循环。

先用有限输入流验证你的消息消费代码，保存为 `follow.mts`，运行 `node follow.mts`（会产生两轮查询）：

```ts follow.mts
import { query, type SDKUserMessage } from "@zpi-dev/agent-sdk";
async function* prompts(): AsyncGenerator<SDKUserMessage> {
  for (const content of ["练习颜色是蓝色。", "刚才是哪种颜色？"]) {
    yield {
      type: "user",
      parent_tool_use_id: null,
      message: { role: "user", content },
    };
  }
}
for await (const msg of query({
  prompt: prompts(),
  options: { model: "deepseek", tools: [], persistSession: false },
})) {
  if (msg.type !== "result") continue;
  if (msg.subtype !== "success") throw Error(msg.errors.join("\n"));
  console.log("本轮：", msg.session_id, msg.result);
}
```

两行结果的会话 ID 应相同。界面每提交一条就向输入流追加一项；决定彻底结束时关闭输入。每轮按它的 result 结算，不要只等整个无限输入迭代结束。只需要一次提问时用字符串更简单。
## resume | 重启后继续指定会话
首次调用允许持久化，在成功结果里保存 `session_id`。下一次使用相同 `cwd`、`zpi.agentDir` 与存储范围，传 `options.resume: 已保存的ID`。用之前明确给过的练习材料验证新回答沿用同一历史。

`continue: true` 选该范围最近的会话，不适合精确恢复指定用户。不能同时给 resume 和 continue；首次使用 `persistSession:false` 也没有可供下次启动恢复的本地历史。
## fork | 从已完成的消息分叉，不截掉原历史
在练习项目中把下面保存为 `branch.mts`，运行 `node branch.mts`。示例在本目录的 `.practice-sdk` 创建练习历史并产生两次模型查询，不会创建 Git 工作树。

```ts branch.mts
import { resolve } from "node:path";
import {
  getSessionMessages,
  forkSession,
  listSessions,
} from "@zpi-dev/agent-sdk";
import { queryResult } from "@zpi-dev/agent-sdk/host";
const dir = process.cwd(),
  zpi = { agentDir: resolve(dir, ".practice-sdk") };
const scope = { dir, zpi },
  options = { cwd: dir, model: "deepseek", tools: [], zpi };
const original = await queryResult({ prompt: "练习颜色是蓝色。", options });
const end = (await getSessionMessages(original.session_id, scope)).findLast(
  (m) => m.type === "assistant",
);
if (!end) throw Error("没有助手消息可分叉");
const branch = await forkSession(original.session_id, {
  ...scope,
  upToMessageId: end.uuid,
  title: "第二种回答",
});
const reply = await queryResult({
  prompt: "刚才说的是什么颜色？",
  options: { ...options, resume: branch.sessionId },
});
console.log(
  reply.result,
  (await listSessions(scope)).map((s) => s.sessionId),
);
```

检查列表有两个不同的 ID。仅指定本地 `resumeSessionAt` 而不分叉，有可能截短原有后续记录；若要保留原历史，明确分叉。
## checkpoint | 先预检，再决定是否回退文件
创建普通本地查询时开启 `enableFileCheckpointing:true`。保存目标**用户消息 ID**，调用 `await run.rewindFiles(id,{dryRun:true})`，检查 `canRewind`、错误和涉及的文件，再决定是否执行不带 dryRun 的调用。

不要对唯一数据做第一次实验；文件被外部修改、没有检查点或不受跟踪时，不等于可以回退整个工作区。文件回退与分叉消息是不同操作。公共 `sessionStore` 不能与文件检查点组合。
## mirror | 接入自己的历史镜像
实现 `SessionStore.append(key,entries)` 与 `load(key)`，在一致的项目键和会话键下保存；子智能体还有 subpath。append 应能安全处理重复写入。要支持列表、删除、子项枚举，再实现对应可选方法。

公共 Store 镜像本地会话，不是随意替换引擎的索引存储。处理 `system/mirror_error`，不要仅凭模型回答成功就宣布远端已保存。`persistSession:false`、宿主会话和文件检查点都不能与此选项组合。
