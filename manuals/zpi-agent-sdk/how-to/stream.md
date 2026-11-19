# 边显示文字边判断这一轮是否成功

你已经能打印最终答案，现在想让终端先显示文字、日志只记一次结果。不要把每个 delta、完整助手消息和最终答案拼在一起。

下面的函数可直接放进 `.mts`；把调用放在应用的 try/catch 内。它仅显示主任务的文本增量，并把经确认的最终正文交给调用方。

```ts
import { query, type Options } from "@zpi-dev/agent-sdk";

export async function showTurn(prompt: string, options: Options): Promise<string> {
  const run = query({ prompt, options: { ...options, includePartialMessages: true } });
  let answer: string | undefined;
  try {
    for await (const m of run) {
      if (m.type === "stream_event" && m.parent_tool_use_id === null &&
          m.event.type === "content_block_delta" && m.event.delta.type === "text_delta") {
        process.stdout.write(m.event.delta.text);
      } else if (m.type === "result") {
        if (m.subtype !== "success") throw new Error(m.errors.join("\n"));
        answer = m.result;
      }
    }
  } finally {
    run.close();
  }
  if (answer === undefined) throw new Error("没有终态结果");
  return answer;
}
```

调用时可传 `{ model: "deepseek", tools: [], persistSession: false }`。检查：流式文字不会在末尾重复一整遍。需要持久展示完整消息时，用 `assistant.message.content` 替换临时显示；工具调用块不是普通文本。异常和无终态在调用层处理，不能以「曾经输出过字」代替成功。

多轮输入用 `AsyncIterable<SDKUserMessage>`：每次 yield 一个 `{ type: "user", parent_tool_use_id: null, message: { role: "user", content: "…" } }`。结束输入迭代才会自然结束查询；每个被消费的输入有自己的结果。请持续消费输出，不要用一个不断增长的数组保存所有 delta。

若只需要最后的成功结果，可直接选用 [/host 的 queryResult](../reference/host.md#result-helper)。字段逐项见[结果判别表](../reference/results.md)。
