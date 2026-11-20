# history | 保存、恢复与撤销
## reopen | 做一个重启后还能续聊的命令行程序
临时问答用 `persistSession:false`；跨进程续聊必须保留会话历史。数据库只保存最后一句回答不够，还要保存 SDK 返回的 **session_id**。这个程序用参数传 ID，不会因为最近刚运行了别的任务而接错对话。

```ts resume.mts
import { resolve } from "node:path";
import { queryResult } from "@zpi-dev/agent-sdk/host";
const id = process.argv[2];
const result = await queryResult({
  prompt: id ? "上一轮记录的颜色是什么？" : "请记住本练习的颜色是蓝色。",
  options: {
    model: "deepseek",
    tools: [],
    cwd: process.cwd(),
    zpi: { agentDir: resolve(".orders-history") },
    ...(id ? { resume: id } : {}),
  },
});
console.log("会话：", result.session_id);
console.log("回答：", result.result);
```

在练习目录运行 `node resume.mts`，复制“会话”后的 ID。结束进程，再在**同一目录**执行 `node resume.mts 刚才的ID`。两次应打印同一个 ID；第二次模型应能使用上轮上下文。两次都是实际模型请求，`.orders-history` 是本地练习数据，不要提交。

首次 create 可用 `sessionId` 指定新 ID；恢复请用 `resume`。`continue:true` 是选相同范围内最近记录，找不到时可能新建，并非用户授权标识。多用户服务应在自己的数据库验证“这个用户拥有这个 ID”后再恢复。
## list | 为历史列表分页、重命名和打标签
完成[持久化练习](reopen.html)后，用相同的 `dir` 与 `zpi.agentDir` 查询。注意创建 Query 时选项叫 `cwd`，历史函数的筛选参数叫 **dir**。不要仅因另一个目录的列表为空就以为数据丢了。

```ts list-history.mts
import { resolve } from "node:path";
import {
  listSessions,
  getSessionInfo,
  renameSession,
  tagSession,
  getSessionMessages,
} from "@zpi-dev/agent-sdk";
const scope = {
  dir: process.cwd(),
  zpi: { agentDir: resolve(".orders-history") },
};
const [first] = await listSessions({ ...scope, offset: 0, limit: 1 });
if (!first) throw Error("先在同目录运行 resume.mts");
await renameSession(first.sessionId, "练习订单", scope);
await tagSession(first.sessionId, "practice", scope);
const info = await getSessionInfo(first.sessionId, scope);
console.log("标签：", info?.customTitle, info?.tag);
const page = await getSessionMessages(first.sessionId, {
  ...scope,
  offset: 0,
  limit: 2,
});
console.log(
  "首屏：",
  page.map((m) => [m.type, m.uuid]),
);
```

运行 `node list-history.mts`。已有一轮时，应看到“练习订单 practice”和用户/助手对应的 UUID；不会为了显示列表再调用模型。消息分页先决定 `includeSystemMessages`，再应用 offset/limit；它不是 token 偏移。列表是按最近修改时间，不应把第一条当作固定收藏项。`includeWorktrees:true` 在此版本明确不支持。
## fork-at | 从一个历史节点分开，而不是截短原会话
要预览新分支而不马上请求模型，取原记录某条消息的公开 `uuid`，调用 `forkSession(id,{...scope,upToMessageId:uuid,title:'另一个方案'})`，保存返回的 `sessionId`；见[可运行的分叉程序](../sessions/fork.html)。在原 ID 和新 ID 上分别用 getSessionMessages 核对分界点。分支里的消息可以获得新 UUID，不要跨分支复用旧气泡的 DOM key。

要“创建并立即继续”可用 `resume:id,forkSession:true,resumeSessionAt:uuid`。只在本地给 `resumeSessionAt` 却没有 fork 会截短原记录，后面的消息并不会自动变成备份；镜像模式更要求这种按点恢复必须分叉。无论哪种，**分叉历史都不复制磁盘文件**。
## undo | 在临时目录里实际验证一次文件回退
仅普通本地 Query 使用 `enableFileCheckpointing:true`。回滚的起点是用户消息 UUID，不是工具调用 ID，也不是 result 的 UUID。下面程序只允许 Write 写一个刚创建的练习文件；全程保持同一个运行对象，拿到 result 后先不销毁它。

```ts rewind.mts
import { mkdtemp, writeFile, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { query } from "@zpi-dev/agent-sdk";
const dir = await realpath(await mkdtemp(join(tmpdir(), "zpi-rewind-"))),
  path = join(dir, "note.txt");
await writeFile(path, "before");
const run = query({
  prompt: "用 Write 将 note.txt 完整写为 after，不加换行。",
  options: {
    cwd: dir,
    model: "deepseek",
    tools: ["Write"],
    enableFileCheckpointing: true,
    zpi: { agentDir: join(dir, "history") },
    canUseTool: async (n, p) =>
      n === "Write" && p.file_path === "note.txt" && p.content === "after"
        ? { behavior: "allow" }
        : { behavior: "deny", message: "仅允许本次练习指定的写入" },
  },
});
try {
  let user = "";
  for (;;) {
    const n = await run.next();
    if (n.done) throw Error("没有终态");
    const m = n.value;
    if (m.type === "user" && !user && m.uuid) user = m.uuid;
    if (m.type === "result") {
      if (m.subtype !== "success") throw Error(m.errors.join("; "));
      break;
    }
  }
  if ((await readFile(path, "utf8")) !== "after")
    throw Error("没有观察到预期写入");
  const plan = await run.rewindFiles(user, { dryRun: true });
  if (!plan.canRewind || !plan.filesChanged?.includes(path))
    throw Error(plan.error ?? `预检未找到目标文件：${JSON.stringify(plan.filesChanged)}`);
  const applied = await run.rewindFiles(user);
  if (!applied.canRewind) throw Error(applied.error);
  console.log("恢复后：", await readFile(path, "utf8"));
} finally {
  await run.return();
  await rm(dir, { recursive: true, force: true });
}
```

运行 `node rewind.mts`。只有真实写入、预检列出目标文件、实际恢复三步均成功，才应打印 `恢复后： before`。模型未调用工具时例子明确报错而非假装成功。普通应用应把 `plan.filesChanged` 先交给用户确认；外部又改过文件时实际回退仍会拒绝。不保证撤销任意 Bash/第三方服务行为，也不裁剪聊天历史。
## delete | 清理测试会话，不删除用户的工作目录
先结束持有该历史的 Query，`await run.return()` 后，从 `listSessions` 用已记录的 ID 核对 `getSessionInfo` 与标题，才调用 `deleteSession(id,scope)`。活跃会话受保护；历史读取也不需要先用新 Query 恢复并写一遍。

删除后 getSessionInfo 应返回 undefined、消息列表为空。删除会话数据与删除项目文件不同；有子记录时检查存储适配器是否支持枚举和删除。对保留几天后的自动清理，先输出待删 ID 清单供确认，不要以“标题相同”作为删除条件。

# storage | 把历史镜像到自己的存储
## adapter | 用内存适配器验证镜像恢复协议
`SessionStore` 是应用提供的**镜像**。先用 SDK 的 `InMemorySessionStore` 走通，再换数据库；内存适配器用来验证接口，不会在服务进程重启后保留数据。以下示例改变本地运行目录，保持同一个镜像实例和项目键。

```ts mirror.mts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemorySessionStore, getSessionMessages } from "@zpi-dev/agent-sdk";
import { queryResult } from "@zpi-dev/agent-sdk/host";
const root = await mkdtemp(join(tmpdir(), "zpi-mirror-"));
const sessionStore = new InMemorySessionStore(),
  projectKey = "demo-orders";
const common = { cwd: root, model: "deepseek", tools: [], sessionStore };
try {
  const a = await queryResult({
    prompt: "演示订单号是 42",
    options: { ...common, zpi: { projectKey, agentDir: join(root, "a") } },
  });
  const b = await queryResult({
    prompt: "刚才的订单号？",
    options: {
      ...common,
      resume: a.session_id,
      zpi: { projectKey, agentDir: join(root, "b") },
    },
  });
  const history = await getSessionMessages(b.session_id, {
    dir: root,
    sessionStore,
    zpi: { projectKey },
  });
  console.log(
    "同一会话：",
    a.session_id === b.session_id,
    "消息数：",
    history.length,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
```

运行 `node mirror.mts`，两轮无工具的正常回复应看到同一 ID 和四条用户/助手消息。查询和历史 helper 必须使用同一个适配器、相同 projectKey，不可按用户输入任意切换租户。`sessionStore` 不能和 `persistSession:false`、文件检查点或借入的宿主会话相组合。
## keys | 实现 append/load：键、顺序、幂等与子记录
键是 `{projectKey,sessionId,subpath?}`。主会话没有 subpath，子记录在 `subagents/agent-…`。把三部分共同作为键，不要只用 sessionId 建一行、让子任务覆盖主记录。`load(key)` 返回按写入顺序的**完整不透明条目**，找不到用 `null`；不要只保存你认识的聊天文本。

`append(key,entries)` 可能重放已有条目。用每条的 `uuid` 做幂等去重，保留原顺序；同一适配器实例的同键写入由 SDK 串行，但跨进程争抢要用数据库事务或等价机制。列表需要 `listSessions(projectKey)` 的 ID 与 mtime；`listSessionSummaries` 可用公共 `foldSessionSummary(prev,key,entries)` 更新标题、tag 等摘要。删除父任务、查子任务分别还需要 delete、listSubkeys 等能力。

验收时连写两次同一批、写一条子记录，再恢复主记录。正确结果是主消息没有重复、子记录仍可单独读出、分页结果没有因重试多一行。
## failures | 分清镜像告警和本地持久化失败
默认 `batched` 模式按数量（100 条）、约 256 KiB 或约 100ms 触发批写，回合收尾也会 drain；`eager` 更早提交，不等于绕过有序队列。`loadTimeoutMs` 控制读/相应 helper 的等待，不是把 append 的超时一起改成这个值。

镜像 append 一般错误最多尝试三次，写超时不自动重试，防止不确定状态下重复提交。耗尽后消费端会看到 `system/mirror_error`：按 `key` 标记“远端未确认”，而不是用正常 result 宣布已经入库。本地持久化失败是不同的致命错误；从镜像读取时报错也不会静默吞掉异常并冒充恢复成功。让适配器分别模拟 append 抛错和 load 抛错，界面上应出现两种不同的结果。

# agents | 配置和观察子智能体
## role | 把一项比对任务交给独立角色
`options.agents` 定义可供选择的角色；父工具还要允许 `Agent`。`agent:'checker'` 则是**让该角色担当当前主角色**，不是在后台委派。一次前台委派的最小可运行例子：

```ts delegate.mts
import { query } from "@zpi-dev/agent-sdk";
const run = query({
  prompt:
    "请实际调用 Agent，让 checker 核对 7 箱×6 瓶是否为 42 瓶，再向我报告。",
  options: {
    model: "deepseek",
    tools: ["Agent"],
    persistSession: false,
    forwardSubagentText: true,
    agents: {
      checker: {
        description: "核对提供的数字，不读文件",
        prompt: "只核对给定的算式，说明依据",
        tools: [],
        maxTurns: 2,
      },
    },
  },
});
let child = false;
for await (const m of run) {
  if (m.type === "assistant" && m.parent_tool_use_id) {
    child = true;
    console.log("子角色输出", m.parent_tool_use_id);
  }
  if (m.type === "result") {
    if (m.subtype !== "success") throw Error(m.errors.join("; "));
    console.log(child ? "已观察到子角色" : "未观察到委派", m.result);
  }
}
```

运行 `node delegate.mts`。子角色没有读写工具，收到父调用交给它的具体 prompt；主对话仍负责合并答案。是否调用取决于模型，程序不伪造进度。`subagent_type` 必须与配置键一致；不存在会产生工具错误。给子项的限制与系统隔离仍是两回事。
## permissions | 控制子角色继承的模型、工具与预算
角色定义可带 `model`、`effort`、`skills`、`maxTurns`。默认沿用父模型；显式选别的提供商时，确保同一运行时能解析完整名称。未指定 tools 时沿用父可用工具去掉 `Agent`，显式 `tools:[]` 表示此角色不用工具。父、子 `disallowedTools` 会合并，不是用子数组抹去父级拒绝。

普通文本检查器不需要文件或 Shell；只给摘要提示，返回结论。父子共享当前费用预算。`forwardSubagentText:true` 让你看到子消息；若还想要子项逐字增量，父级还要设 `includePartialMessages:true`，用 `parent_tool_use_id` 分组而非猜每一行的作者。
## transcripts | 读取历史里的子任务记录
先用持久化 Query 完成委派并记录父 `session_id`。在同样的 `dir` / `agentDir` 下调用 `const ids=await listSubagents(parentId,scope)`，再对选中的 ID 调用 `getSubagentMessages(parentId,ids[0],scope)`。列表为空要检查是否真的调用 Agent、是否用了 `persistSession:false`。

历史 agent ID、实时调用 ID 和任务控制用的 task ID 不能相互替代。只为 UI 展示单个子任务就按需取一份记录，不要把所有子记录无条件拼入主上下文。用镜像跨本机恢复时，适配器还要能枚举这些子键。
