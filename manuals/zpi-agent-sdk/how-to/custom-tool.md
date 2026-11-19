# 接入一个只能查询演示订单的工具

订单状态存放在你的程序，不在模型记忆中。给模型一个有参数约束的只读函数，比把数据库连接或 Shell 暴露给它简单。

先按[首次查询](../tutorial/first-query.md)准备项目和模型凭据；此例直接导入 TypeBox，在项目里运行 `npm install typebox@1.3.27`（与本册 SDK 的依赖版本一致）。保存为 `order.mts`：

```ts
import { defineTool, query } from "@zpi-dev/agent-sdk";
import { Type } from "typebox";

const order = defineTool({
  name: "lookup_order",
  description: "从练习数据中查询订单，不访问真实客户信息",
  parameters: Type.Object({ id: Type.String({ minLength: 1 }) }),
  execute({ id }, { signal }) {
    signal?.throwIfAborted();
    return { id, status: id === "42" ? "已发货" : "未找到" };
  },
});

let called = false;
for await (const m of query({
  prompt: "请调用 lookup_order 查询订单 42，按工具结果回答。",
  options: { model: "deepseek", tools: [order.name], persistSession: false,
    zpi: { customTools: [order] } },
})) {
  if (m.type === "assistant") {
    called ||= m.message.content.some(b => b.type === "tool_use" && b.name === order.name);
  }
  if (m.type === "result") {
    if (m.subtype !== "success") throw new Error(m.errors.join("\n"));
    console.log(called ? "模型调用了工具" : "未观察到调用", m.result);
  }
}
```

运行 `node order.mts`。`customTools` 注册实现，`tools` 选择让模型看到的名称；只做其中一步不是同一件事。检查工具调用及对应的用户型 `tool_result` 内容，不要只凭回答里的「已发货」当作调用证据。模型可能不调用工具，这是可观察的结果，不是强制路由。

`execute(params, { signal, toolCallId })` 可返回字符串或可 JSON 序列化的对象，也可返回 Promise。若连接真实服务，认证、参数校验、租户权限和超时仍由应用负责。要显示进度或返回图像，使用 [/host 的原生 ToolDefinition](../reference/host.md)。
