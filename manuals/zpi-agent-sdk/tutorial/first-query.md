# 第一次查询：让一个独立的 TypeScript 程序报告成功或失败

你想先证明「我的 Node 程序可以调用模型」，暂时不需要 Shell、文件操作或桌面窗口。这个练习只问一句话，输出可读结果并设置退出状态，不把对话保存成历史。

## 创建项目

使用 Node.js **24.x** 和 npm。在一个新建的空目录运行：

```sh
npm init -y
npm install @zpi-dev/agent-sdk
npm ls @zpi-dev/agent-sdk
```

记下实际安装的版本。这是普通 npm 应用，不需要克隆 ZPI、装桌面端或运行工作区脚本。本教程核对的是 0.1.65 的公开 ESM 入口。在同一终端准备你自己的 `DEEPSEEK_API_KEY`；不要把 Key 写在文件里。不熟悉如何安全输入环境变量，可参考 [macOS zsh 示例](../../zpi-quick-chat/reference/setup.md)。真实请求可能收费。

## 保存并运行

新建 `first-query.mts`，复制以下完整内容。`.mts` 让 Node 24 把这个 TypeScript 文件视为 ES 模块；无需编译器或第三方运行器。

```ts
import { query } from "@zpi-dev/agent-sdk";

try {
  let received = false;
  for await (const message of query({
    prompt: "用一句中文向第一次使用 SDK 的人问好。",
    options: {
      model: "deepseek",
      env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY },
      tools: [],
      persistSession: false,
    },
  })) {
    if (message.type !== "result") continue;
    received = true;
    if (message.subtype === "success") {
      console.log("成功：", message.result);
    } else {
      console.error("失败：", message.subtype, message.errors.join("\n"));
      process.exitCode = 1;
    }
  }
  if (!received) throw new Error("没有收到本轮 result");
} catch (error) {
  console.error("查询异常：", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
```

```sh
node first-query.mts
```

## 核对结果，不核对问候语

- 看到 `成功：` 和一段正文：本轮返回了 `result/success`。真实模型不承诺固定措辞或一秒返回；官网小窗口才使用固定问候。
- 看到 `失败：`：流中**有**终态结果，读后面的 `subtype` 与 `errors`。不要再读取只在成功分支存在的 `result` 字符串。
- 看到 `查询异常：`：创建、初始化或消费流也可能直接抛错。比如在 macOS/Linux 用 `env -u DEEPSEEK_API_KEY node first-query.mts` 只为这一次移除 Key；应该报告模型未配置、非零退出，不会为了这个检查发请求。不要为测试失败而故意发送无效密钥。

现在可以把问候换成自己的提示。要把片段显示在 UI，又只结算一次，接着读[流式显示与结果判断](../how-to/stream.md)。
