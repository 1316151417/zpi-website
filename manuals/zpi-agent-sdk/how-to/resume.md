# 继续旧会话，或在不改原历史的前提下分叉

要让第二次启动的程序记得上一轮，请先保存**会话 ID**，不要把最后一条回复的 UUID 当成它。下面在当前练习目录写 `.practice-sdk`，而不是碰已有的 SDK 历史。

```ts
import { resolve } from "node:path";
import { forkSession, getSessionMessages, listSessions } from "@zpi-dev/agent-sdk";
import { queryResult } from "@zpi-dev/agent-sdk/host";

const cwd = process.cwd();
const zpi = { agentDir: resolve(cwd, ".practice-sdk") };
const scope = { dir: cwd, zpi };
const options = { cwd, zpi, model: "deepseek", tools: [] };
const first = await queryResult({ prompt: "本次练习的颜色是蓝色。", options });
console.log("保存此会话 ID：", first.session_id);
const messages = await getSessionMessages(first.session_id, scope);
const reply = messages.findLast(m => m.type === "assistant");
if (!reply) throw new Error("没有可用于分叉的助手消息");
const branch = await forkSession(first.session_id, { ...scope, upToMessageId: reply.uuid, title: "另一种说法" });
const next = await queryResult({ prompt: "刚才提到了什么颜色？",
  options: { ...options, resume: branch.sessionId } });
console.log(next.result, (await listSessions(scope)).map(s => s.sessionId));
```

保存为 `branch.mts`，在准备好凭据的独立项目运行 `node branch.mts`；会产生两次真实模型查询。检查：列表中两个 ID 不同，新增回答属于分支。只想续聊，用 `resume: first.session_id` 而不调用 `forkSession`。`continue: true` 按范围选择最近记录，不适合需要精确恢复指定用户会话的服务。

不希望改原记录时，**不要**只加 `resumeSessionAt`：本地非分叉恢复可以截短原来的后续记录。分叉也不会复制磁盘项目。遇到找不到 ID，先对照原来的 `cwd`、`agentDir`、镜像适配器和 `projectKey`，并确认首次没有 `persistSession: false`。

需要保存到自己的后端？先查[外部镜像的接口和失败语义](../reference/sessions.md#store)。
