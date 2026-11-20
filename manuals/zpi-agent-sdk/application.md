# workshop | 做一个能交付的订单助手
## cli | 从提问脚本到可重复调用的 CLI
假设你在做客服系统：用户输入订单号，程序应该返回系统里真实的状态，而不是让模型猜。本章做一个可以运行的纵向例子：接收命令行参数 → 注册查询工具 → 让模型调用 → 只在观察到正确调用后交付回答。不需要数据库或 Desktop。

在空项目执行 `npm init -y` 和 `npm install @zpi-dev/agent-sdk@0.1.65 typebox@1.3.27`。用 Node.js 24，按[首次查询](../start/first.html)设置服务端 DeepSeek 密钥。保存为 `orders.mts`：

```ts orders.mts
import { defineTool, query } from "@zpi-dev/agent-sdk";
import { Type } from "typebox";

const id = process.argv[2];
if (!id || !/^\d+$/.test(id)) throw Error("用法：node orders.mts 42");
const records = new Map([["42", "已发货"]]);
let observation: string | undefined;
const lookup = defineTool({
  name: "lookup_order",
  description: "查询本次请求中的订单，只返回配送状态",
  parameters: Type.Object({ id: Type.String() }),
  execute(input) {
    if (input.id !== id) throw Error("订单号与本次请求不一致");
    observation = records.get(id) ?? "未找到";
    return { id, status: observation };
  },
});
const run = query({
  prompt: `调用 lookup_order 查询订单 ${id}，用一句中文回答。`,
  options: {
    model: "deepseek",
    tools: [lookup.name],
    zpi: { customTools: [lookup] },
    settingSources: [],
    persistSession: false,
    maxTurns: 3,
  },
});
try {
  let delivered = false;
  for await (const m of run) {
    if (m.type !== "result") continue;
    if (m.subtype !== "success")
      throw Error(`${m.subtype}: ${m.errors.join("; ")}`);
    if (observation === undefined) throw Error("模型没有查询订单，不能交付");
    console.log(
      `订单 ${id}｜业务记录：${observation}\n助手回复：${m.result}`,
    );
    delivered = true;
  }
  if (!delivered) throw Error("没有完成的回答");
} finally {
  await run.return();
}
```

### 怎样验收，不依赖某句模型措辞？
运行 `node orders.mts 42`。第一行应是 `订单 42｜业务记录：已发货`；第二行是模型组织的文字，不要求逐字一样。换成 `node orders.mts 99`，第一行必须是“未找到”，即使回答写得很自信，也不能让模型覆写这个字段。`node orders.mts` 不传参数应在向模型付费之前报用法错误。

这个例子故意把授权检查放在程序里：提示词不能限制模型只能查询一个订单。接入真实系统时，先验证请求者有权查看订单，再执行查询，日志不要记录整份客户资料。接下来把[一次工具调用画到界面上](../events/tool-pair.html)，或[让用户下次还能继续](../history/reopen.html)。
## choose | 什么时候直接调用模型，什么时候用这套 SDK？
如果程序要按已知 ID 查一个状态且不需要自然语言，直接调用业务函数即可。SDK 的价值在于管理一个循环：用户提供目标，模型可以提出工具调用，程序提供实际结果，再让模型根据结果继续或收尾。它不会替你提供模型账号、订单数据、UI 或 OS 隔离。

以订单助手为例，`defineTool` 描述“能问什么”，`execute` 才获得业务数据；`query` 管本次运行；`session_id` 是多轮对话的身份。要接网页，浏览器只把用户输入发送给你的服务器并接收展示事件，SDK 和服务密钥留在服务器。桌面插件、联网搜索和系统热键不属于 SDK 默认界面。

只需要一条答案选[最终结果](../output/final.html)；要在消息流中显示进度选[流式输出](../output/stream.html)；若服务**已经拥有原生 AgentSession**，才选[宿主集成](../host/owner.html)。这些不是必须依次搭建的层次。

# lifecycle | 一次 Query 从何时开始，到何时结束
## initialize | 不发送消息，先列出能用的模型与命令
`query()` 返回运行对象，不会因为赋值就发送 prompt。传入不支持的选项可能在构造时同步报错；第一次迭代或调用元数据方法才会初始化会话。下面的程序适合给设置页做“配置自检”，并不是在测试服务端鉴权。

```ts inspect.mts
import { query } from "@zpi-dev/agent-sdk";
const run = query({
  prompt: "不要发送这条消息",
  options: { model: "deepseek", tools: [], persistSession: false },
});
try {
  const info = await run.initializationResult();
  console.log(
    "模型：",
    info.models.map((m) => m.value),
  );
  console.log(
    "命令：",
    info.commands.map((c) => c.name),
  );
  console.log(
    "角色：",
    info.agents.map((a) => a.name),
  );
  console.log("上下文：", await run.getContextUsage());
} finally {
  await run.return();
}
```

运行 `node inspect.mts`。预期是模型清单而非“助手回答”；无可用模型会在初始化时报错。`initializationResult()` 返回设置页用的目录；迭代中的 `system/init` 才是本次会话的实际 `session_id`、工作目录、模型和可见工具。两者不是同一种消息。
## consumer | 在 React 或 API 服务里持有一个消费者
将运行对象交给服务层，由**一个** `for await` 循环分发：文本增量给输出区，工具事件给活动栏，每轮 result 给状态栏。不能把同一个 Query 同时交给两个各自读取的组件：它是队列，不是每个订阅者各收一份的广播。

页面用户点“停止”时把请求传给这个对象，不要再新建 Query。前端断开、不再展示时由持有者清理。只消费第一条后把对象丢在缓存里会留下待处理输出；此版本积压 4096 条未消费事件会中止。慢客户端应批量刷新画面，但持续排空事件，不要把所有 delta 永久保存在数组。

用两次连续提问验证：每个完整答案只出现一次，末尾不再重复打印，任务结束后没有仍引用旧对象的停止按钮。
## controls | interrupt、close、return、abort 到底选哪个？
| 需求 | 操作 | 调用方怎样收尾 |
|---|---|---|
| 用户想停下这一轮，但还在看会话 | `await run.interrupt()` | 继续消费，显示实际终态；不要从返回值取答案 |
| 调用方不再要任何输出 | `run.close()` | 丢弃尚未消费的输出并发起取消，不承诺再交付 result |
| 页面或请求正在释放资源 | `await run.return()` | 关闭并等待已启动的生产循环清理；适合 finally |
| 外部超时要取消整个运行树 | 创建时传 `abortController`，到期 `abort()` | 包住迭代及异常路径，不假定必有终态 |
| 只停一项后台工作 | `await run.stopTask(taskId)` | 按匹配 ID 的 task_notification 更新该行 |

例如对网络请求设置截止时间，先启动计时器，用同一 controller 创建 Query，在 finally 里 `clearTimeout(timer); await run.return()`。不要把每个请求都绑在一个全局 controller 上。已写的文件、已送到其他服务的请求，不会因取消而自动撤回。
## identity | 给输入分配 UUID，把回显接回正确的气泡
同一句“继续”可能出现两次，不能按文本配对。多轮输入可给每个 `SDKUserMessage` 生成独立 `uuid`，`parent_tool_use_id:null`。保留这个值等待用户回显，再将草稿状态从“待处理”改为“已接收”。

```ts input-id.mts
import { randomUUID } from "node:crypto";
import { query, type SDKUserMessage } from "@zpi-dev/agent-sdk";
const sent = [randomUUID(), randomUUID()];
async function* input(): AsyncGenerator<SDKUserMessage> {
  for (const uuid of sent)
    yield {
      type: "user",
      uuid,
      parent_tool_use_id: null,
      message: { role: "user", content: "继续" },
    };
}
const seen = new Set<string>();
for await (const m of query({
  prompt: input(),
  options: { model: "deepseek", tools: [], persistSession: false },
})) {
  if (m.type === "user" && m.uuid && sent.some((id) => id === m.uuid))
    seen.add(m.uuid);
  if (m.type === "result" && m.subtype !== "success")
    throw Error(m.errors.join("; "));
}
console.log("已确认的不同输入：", seen.size);
```

运行 `node input-id.mts` 应得到 2。会话 ID、输入 UUID、一次工具调用的 ID 和后台任务 ID 都标识不同对象；不要拿用户 UUID 去恢复会话。外部提供 `tool_result` 冒充用户输入不受支持，工具响应由 SDK 的执行循环产生。
## image | 将一张图片作为消息内容，而不是路径字符串
只写 `/tmp/receipt.png`，模型收到的是文字；要实际传图，使用支持图像的**已配置模型**，把图片字节作为 base64 内容块。下面是应用可直接导入的输入适配器：

```ts image.mts
import { readFile } from "node:fs/promises";
import type { SDKUserMessage } from "@zpi-dev/agent-sdk";
export async function* picture(
  pngPath: string,
): AsyncGenerator<SDKUserMessage> {
  const png = await readFile(pngPath);
  yield {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [
        { type: "text", text: "只描述图片中的标题，不推断未出现的信息。" },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: png.toString("base64"),
          },
        },
      ],
    },
  };
}
```

把 `picture('练习.png')` 当作 `query` 的 `prompt`，而不是当工具参数。`media_type` 要与文件一致，`data` 不带 data URL 前缀。服务器要限制上传大小并检查来源；读私人图片、把它送到模型是两个需要获得允许的动作。遇到模型不支持图片时换具备视觉输入的模型，不要只改 MIME 声明。

# models | 选择和控制模型
## provider | 注册自有服务并检查模型解析结果
使用环境变量发现的模型已经能回答时，不必创建运行时。需要自定义地址、协议和模型价格时，注册一个有明确名称的 provider，再用限定名称选模型。以下程序**只检查注册**，不发送请求：

```ts provider.mts
import { query, type Options } from "@zpi-dev/agent-sdk";
const endpoint = process.env.MODEL_BASE_URL;
const apiKey = process.env.MODEL_API_KEY;
if (!endpoint || !apiKey)
  throw Error("请设置 MODEL_BASE_URL 和 MODEL_API_KEY");
const provider: NonNullable<
  NonNullable<Options["zpi"]>["providers"]
>[string] = {
  api: "openai-completions",
  baseUrl: endpoint,
  apiKey,
  models: [
    {
      id: "service-model",
      name: "练习模型",
      input: ["text"],
      reasoning: false,
      contextWindow: 8192,
      maxTokens: 512,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
  ],
};
const q = query({
  prompt: "未发送",
  options: {
    model: "internal/service-model",
    tools: [],
    persistSession: false,
    zpi: { providers: { internal: provider } },
  },
});
try {
  console.log((await q.supportedModels()).map((m) => m.value));
} finally {
  await q.return();
}
```

运行 `node provider.mts`，清单应包括 `internal/service-model`。真实调用前，用服务端实际的模型 ID、协议和限额代替示例值；测试价格全部为零不适合预算控制。模型解析先匹配 `provider/model`，再匹配提供商别名（第一个可用模型），最后匹配裸模型名；两个提供商有同名模型会报 ambiguous。预检有名字，只证明本地能解析，不代表服务器接受调用。
## runtime | 复用 ModelRuntime，不复用别人的对话
服务同时处理多个独立聊天时，可以在服务端用 `await ModelRuntime.create()` 构造运行时，调用 `runtime.registerProvider(id,config)` 注册，再把同一 `zpi.modelRuntime` 给具有不同身份的 Query。它复用提供商和模型配置，**不会因此共享一份对话历史**。

注意优先级：显式传入 runtime 后，SDK 不再为它自动补注册来自 `env` 或 `zpi.providers` 的服务。模型列表为空，先检查创建运行时的那段代码。更新一个用户的凭据不要写进供所有用户共享的 runtime；按凭据边界选择运行时实例。
## switch | 在同一段多轮会话里切换模型
先由 `await run.supportedModels()` 找到候选的 `value`，比如 `provider/id`。收到一轮 result 后，在推入下一条用户输入**之前**调用 `await run.setModel(value)`；这样下一轮复用历史但用新模型。不要指望切换能改写已经收到的 assistant 消息。

若传的是不存在或重名的裸 ID，明确显示错误，让用户保留原选择；不要悄悄退回第一个模型。比较两种回答且不想影响后续上下文，改用[分叉](../sessions/fork.html)。
## thinking | 分清推理强度、思考预算和输出上限
`thinking:{type:'disabled'}` 或 `maxThinkingTokens:0` 用于关闭推理；`effort` 选择支持的级别，正的思考预算会映射到请求的 thinking budgets。可在两轮之间调用 `setMaxThinkingTokens(0)`；`null` 是清掉显式数字预算，不是切换到另一个模型。

限制**最终输出**应在 `zpi.requestOptions` 用服务商支持的 `maxTokens`，限制模型循环用 `maxTurns`，两者都不是推理强度。先固定 prompt 和模型，一次只改一个选项；服务商不支持相应参数时，SDK 不能凭配置赋予模型新能力。
## transport | 设置单次请求超时，不把它当作任务截止时间
`zpi.requestOptions:{timeoutMs:20000,maxRetries:0,maxTokens:512}` 描述送往模型提供商的单次请求。也可给返回选项的函数，按每次发起请求时的服务策略决定数值。需要替换 HTTP 客户端时用 `zpi.fetch` 创建 SDK 自管的运行时；已有的 ModelRuntime 应在其创建处注入 transport。

如果一次任务调用了两个工具，可能产生多次模型请求，因此每次 20 秒不等于总共 20 秒。整体截止时间用 `abortController`；计费按实际请求核对。记录耗时、状态和请求次数即可，不要在调试 fetch 中把密钥或完整消息打进日志。
