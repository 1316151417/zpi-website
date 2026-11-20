# resources | 给应用装配指令、技能与插件
## instructions | 准确控制 SDK 会读取哪些项目文件
程序默认不为你扫描所有本机设置。传 `settingSources:[]` 时，从一个不含本地规则的基线开始。要复用已有规则，再显式选范围：

| 来源 | 读取的说明 | 技能位置 |
|---|---|---|
| `user` | 用户主目录下 `.claude/CLAUDE.md` | `~/.claude/skills/<目录>/SKILL.md` |
| `project` | 工作目录下 `.claude/CLAUDE.md`、`CLAUDE.md`、`AGENTS.md` | `<cwd>/.claude/skills/…` |
| `local` | 工作目录下 `.claude/CLAUDE.md` 和 `CLAUDE.local.md` | 同一项目技能目录 |

例如临时在项目根写 `AGENTS.md`，约定“日期展示用 YYYY-MM-DD”，用相同问题分别在 `[]` 和 `['project']` 下运行。预期差异是后一查询装配项目指令，不是每种模型都一定服从措辞。SDK 的这些路径与 Desktop 的技能发现路径不完全相同。加载别人的仓库等于允许不可信文档进入提示；生产服务应先评估信任范围。
## skill | 创建一个技能，并确认真正注册了 Skill 工具
新建练习目录，在 `.claude/skills/triage/SKILL.md` 写入：

```md
---
name: triage
description: 把反馈分类为故障或建议并引用依据
---
先引用用户反馈中的现象，再给出分类，不猜测未提供的信息。
```

在这个目录运行 `node skills.mts`。这次会调用模型：先看初始化记录证明技能存在，再看工具调用证明模型确实使用了它。

```ts skills.mts
import { query } from "@zpi-dev/agent-sdk";
const run = query({
  prompt: "加载 triage，分类这条反馈：保存按钮无反应。",
  options: {
    model: "deepseek",
    tools: ["Skill"],
    skills: ["triage"],
    settingSources: ["project"],
    persistSession: false,
  },
});
let used = false;
for await (const m of run) {
  if (m.type === "system" && m.subtype === "init")
    console.log(
      "技能已注册：",
      m.skills.includes("triage") && m.tools.includes("Skill"),
    );
  if (m.type === "assistant")
    used ||= m.message.content.some(
      (b) => b.type === "tool_use" && b.name === "Skill",
    );
  if (m.type === "result") {
    if (m.subtype !== "success") throw Error(m.errors.join("; "));
    console.log("调用了技能：", used, m.result);
  }
}
```

检查第一条 `system/init.skills` 包含 `triage`、`tools` 包含 `Skill`，再看调用参数 `{skill:'triage'}` 和返回的正文。技能名只用字母、数字、下划线、点或连字符；缺描述或头部格式不对会报错。只选 `skills:['triage']` 不能替代资源来源，也不保证模型主动调用。
## plugin | 导入一个本地插件，并列出它的命令
在练习项目建 `sample/.claude-plugin/plugin.json`，内容 `{"name":"sample","version":"1.0"}`。新建 `sample/commands/greet.md`，写「请用一句话向 $ARGUMENTS 问候」。作为数据导入本地插件，不需要发布到 npm。

```ts plugin.mts
import { query } from "@zpi-dev/agent-sdk";
const run = query({
  prompt: "/sample:greet 小周",
  options: {
    model: "deepseek",
    tools: [],
    persistSession: false,
    plugins: [{ type: "local", path: "./sample" }],
  },
});
try {
  const commands = await run.supportedCommands();
  if (!commands.some((c) => c.name === "sample:greet"))
    throw Error("没有导入 sample:greet");
  for await (const m of run)
    if (m.type === "result") {
      if (m.subtype !== "success") throw Error(m.errors.join("; "));
      console.log("插件命令完成：", m.result);
    }
} finally {
  await run.return();
}
```

运行 `node plugin.mts`，应先能发现限定名称，再拿到一次回答。插件自己的技能和角色也有名字空间；agents Markdown 需要头部元数据，不要把命令的宽松格式套给角色。插件还可能含可执行 hook，**只导入可信目录**。设置 `zpi.agentDir` 可把练习的插件缓存和会话放进独立位置。
## prompt | 分清系统提示、追加规则与可执行权限
只需要固定角色时给 `systemPrompt:'你是订单客服…'`，多段可传字符串数组。要沿用预置系统上下文且补一条规则，用 `{type:'preset',preset:'claude_code',append:'不要推断发货日期。'}`。自行提供模板时也可用 `{type:'custom',prompt:[…]}`。

角色选择 `agent`、项目指令、技能与 hooks 还可能贡献内容。排查“为什么忽略我的要求”时，先用空资源、无插件、无工具确认基线，再一次只增加一个来源。系统提示词说“禁止写入”不是授权规则，更不能代替 OS 文件权限。

# host | 宿主拥有会话时怎样接入
## owner | 现有会话为什么还需要 manager 和 runtime？
普通应用传 prompt 和 options，由 SDK 创建并清理会话。只有当你的编辑器或服务**已经**持有原生会话、索引和活动作业时，才把它借给公共 Query。三件事要成套：`zpi.session` 是在运行的 AgentSession，`zpi.sessionManager` 指向同一 ID 的记录，`zpi.modelRuntime` 知道它用的模型。

在创建原生会话时配置 `noTools`、工具、资源、hooks 和 `beforeModelRequest`；然后借用，接收 SDK 消息。身份不匹配会在初始化时报错。额外传公共 `tools`、`canUseTool`、`allowedTools`、`disallowedTools`、`hooks`、`maxBudgetUsd` 或 `maxTurns` 也会被拒绝，而非悄悄覆盖宿主策略。[可调用的借用函数](../production/host.html)只投影已有能力，不接管 owner 的销毁义务。
## control | 把 SDK 停止按钮转发给宿主的任务表
借入方不知道宿主怎样管理子进程或后台任务。用 `zpi.taskControl.stopTask` 把 **会话 ID、任务 ID 和取消信号** 交回真正的所有者。没有这个端口时，`run.stopTask()` 会明确报不支持，不应在 UI 上标记“已停止”。

```ts host-control.mts
import { query, type ModelRuntime } from "@zpi-dev/agent-sdk";
import type { CreateAgentSessionResult } from "@zpi-dev/agent-sdk/host";
export async function stopOwned(
  owner: CreateAgentSessionResult,
  modelRuntime: ModelRuntime,
  taskId: string,
  stop: (session: string, task: string, signal: AbortSignal) => Promise<void>,
) {
  const q = query({
    prompt: "只做控制，不发给模型",
    options: {
      zpi: {
        session: owner.session,
        sessionManager: owner.sessionManager,
        modelRuntime,
        taskControl: { stopTask: stop },
      },
    },
  });
  try {
    await q.stopTask(taskId);
  } finally {
    await q.return();
  }
}
```

给 stop 实现传入宿主自己的任务表，验证任务确实属于该会话；适配器返回后检查同一项是否停止。若要同步进度，再实现 `taskControl.subscribe` 并提供取消订阅函数。Query 结束时释放自己的订阅，不 dispose 宿主持有的 session。宿主最后自己 abort 并 dispose。
## ports | TranscriptStore 和公共 SessionStore 不是同一种数据库接口
如果你需要引擎直接在现有索引上查询历史、构建上下文，原生 `createAgentSession` 接受宿主的 `storage:{transcript,currentState}`；这条创建路径与直接传 sessionManager 互斥，由创建结果给出相配的 manager。`SettingsManager` 管运行设置，不是 transcript 数据库。

公共 `SessionStore` 则订阅本地 session 条目、按 key 追加镜像和按需加载；它不能与 `zpi.session` 混用。选型时问一句：谁是唯一写入者？若原服务已经写入历史，不再叠一层公共镜像作为第二个权威源。要的是普通服务的备份与恢复，读[镜像练习](../storage/adapter.html)即可。
## native | 什么时候不用 defineTool 而使用原生 ToolDefinition？
简单工具的返回值是字符串或可 JSON 序列化的对象，适合订单状态。若宿主需要展示中间进度、图片块或结构化 details，就为 `zpi.customTools` 实现原生 `ToolDefinition`：执行函数的形状是 `execute(toolCallId, params, signal, onUpdate, …)`，返回 `{content,details}`，不再是 defineTool 的 `(params,context)`。

同理，可信程序内的 `zpi.plugins` 是原生 SessionPlugin，`options.plugins` 是磁盘上导入的本地插件描述，`zpi.resourceLoader` 则供宿主提供指令、技能的装载器。已有预处理输入时才走 `zpi.input:{parsed,context}`，且必须借入宿主 session。普通 HTTP 应用只需要一个函数工具时，选择[defineTool](../tools/define.html)，不要为了导入一个类型而创建第二套会话。

# diagnose | 调试 SDK 应用
## sequence | 给一次模型请求做可复现的验收
先在临时目录用 `model:'deepseek',tools:[],persistSession:false` 运行一次最短问题，记录 session ID、消息种类和 result 子类型。验证三条分支：成功时交付正文；服务商拒绝时显示错误；缺少模型配置时在 try/catch 能看到初始化异常。只有最后一种不能被误当作“空的成功回答”。

再只开放一个业务工具，记录 `tool_use.id` 是否与 `tool_result.tool_use_id` 对上，以及实际业务状态。然后再打开持久化，做一次跨进程恢复。这样如果失效，你能分辨是模型、执行工具、呈现事件，还是读写历史的问题，而非把所有选项一起改一遍。
## retries | 流式、结构化输出和重试的边界
需要 JSON 时传 `outputFormat.type:'json_schema'`，只消费成功 result 的 `structured_output`。SDK 会解析并校验最终文本；此版最多检查三次，可能追加纠正请求。因此 schema 不符既可能产生额外费用，也可能先触发轮数或预算上限。不要在 UI 把半截 JSON 当成已通过校验的业务数据。

网络重试、结构化输出纠正、用户重新点提交不是一件事。真实工具有外部副作用时，应用要为业务操作提供幂等键，避免一次请求失败后重发两次写入。若 SDK 报失败，先检查已经出现的工具记录再决定是否重试。
## compatibility | 不要把其他 Agent SDK 的样例直接复制过来
名称相似不代表能力相同。当前公开路径是包根和 `/host`；`permissionMode`、MCP、LSP、外部 `tool_result` 注入和内置 UI 不在这套接口内。`Glob`、`Grep` 虽有保留定义，实际执行明确不支持。历史列表参数 `includeWorktrees:true` 也会被拒绝。

验证自己的版本用 `npm ls @zpi-dev/agent-sdk`，类型以该版本安装包提供的 `.d.ts` 为准。示例使用 Node.js 24 的 `.mts` 类型剥离；`node file.mts` 能执行不等于静态类型正确，持续集成应另跑 `tsc --noEmit --strict --module NodeNext --target ES2023 --skipLibCheck` 并安装 Node 类型。不要从未公布的内部包路径导入来绕过类型不匹配。
