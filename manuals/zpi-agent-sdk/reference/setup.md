# 包入口、运行平台与模型选择

这里查「导入什么」「凭据从哪里来」以及同名模型怎么消歧。此接口给服务端或本机 Node 程序用，不应把用户 Key 打进浏览器包。

| 项 | 合同 |
| --- | --- |
| 安装与运行时 | `npm install @zpi-dev/agent-sdk`，Node.js `>=24 <25`，ESM。更新用 `npm install @zpi-dev/agent-sdk@latest`。SDK 包没有桌面端的 Windows 排除项；要执行 Bash 仍需本机有相应 Shell |
| 主入口 `@zpi-dev/agent-sdk` | `query`、`defineTool`、`ModelRuntime`、会话查询/变更函数、`InMemorySessionStore`、`foldSessionSummary` 以及公开类型 |
| `@zpi-dev/agent-sdk/host` | 原生宿主入口；不是 `query` 的导入路径。没有第三个受支持的源码或 `dist` 深层导入入口 |
| 包版本 | 在项目中运行 `npm ls @zpi-dev/agent-sdk`。本册使用 0.1.65 的本地打包制品核对，不保证 `@latest` 指向这个版本 |
| 环境发现 | `options.env` 或进程环境；显式传 `env` 不会自动合并整个 `process.env`。DeepSeek 用 `DEEPSEEK_API_KEY`；OpenAI API 用 `OPENAI_API_KEY`；其他预置变量见[提供商表](../../zpi/reference/setup.md#providers)。SDK 不代办桌面订阅登录 |
| Anthropic | `ANTHROPIC_API_KEY` 加明确模型 ID（`options.model` 或 `ANTHROPIC_MODEL`）；可用 `ANTHROPIC_BASE_URL` 指定服务端点 |
| `options.model` | 依次匹配 `provider/model`、提供商别名、裸模型 ID。别名选择该提供商可用目录首项；裸 ID 重名报错，未给值时取可用目录首项。重要任务显式指定 |
| 自定义模型 | `options.zpi.providers` 注册具名服务，其 `api` 选 `openai-completions`、`openai-responses` 或 `anthropic-messages`；按服务填写 `baseUrl`、`apiKey`（或 `getApiKey`）、模型的 `id`、输入类型、上下文、输出上限、推理与价格 |
| 复用运行时 | `await ModelRuntime.create()`、`runtime.registerProvider(id, config)`、`await runtime.getAvailable()`、`runtime.getModel(provider,id)`；传 `zpi.modelRuntime` 使用这个已配置实例，不会再为它自动发现环境凭据或注册 `zpi.providers` |

目录可以列出不等于认证请求成功。环境预置的价格为零；若要按金额限制，配置与服务商一致的价格，不能把结果中的零当成免费。自定义 `fetch` 可做传输观测或测试，请避免记录 Authorization 和私有内容。

只想用一个 Key 接通第一轮？回到[独立程序教程](../tutorial/first-query.md)。
