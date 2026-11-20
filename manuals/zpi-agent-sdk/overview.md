用 TypeScript 在自己的应用里运行智能体：让模型选择工具，让程序执行操作，再根据真实结果继续回答。

ZPI Agent SDK 把模型请求、工具执行和会话历史放在同一个运行循环中。假设用户问「订单 42 发货了吗？」：模型可以提出查询，你的程序从订单系统取回状态，模型再用取回的记录组织答复。**谁能查订单、查到什么才算成功，始终由你的程序决定。**

### 选择适合你的入口

| 你想做什么 | 使用 | 谁负责执行 |
|---|---|---|
| 在服务端把对话、工具和历史接进自己的产品 | **ZPI Agent SDK** | 你的 Node.js 进程运行 Agent 循环；你提供模型凭据和业务权限 |
| 在本机项目里让助手改文件并审查差异 | [ZPI Desktop](../zpi/index.html) | 桌面应用提供界面、工作区和插件，不需要写集成代码 |
| 在 Mac 的其他应用上方临时问一句 | [ZPI Quick Chat](../zpi-quick-chat/index.html) | 浮窗处理唤起、草稿与显示，不需要自己管理 Query |
| 只发一次模型请求，不需要工具循环或历史 | 模型提供商的客户端 | 你自行发送请求、读取响应；必要时自己实现工具调度 |

### SDK 能做什么

| 能力 | 你可以实现什么 |
|---|---|
| [Agent 循环](guide/loop.html) | 从一次输入走到工具调用、工具结果和终态，不把“模型说做了”误认成完成 |
| [流式输出](output/stream.html)与[结构化输出](output/structured.html) | 在界面逐字显示，同时只把通过 schema 校验的结果交给下游 |
| [工具与权限](concepts/permissions.html) | 注册业务函数、选择模型可见的工具，并在实际执行前批准或拒绝 |
| [会话](concepts/sessions.html)与[外部存储](storage/adapter.html) | 跨进程接着聊，从旧消息分叉，或将记录镜像到自己的存储 |
| [子智能体](agents/role.html)与[钩子](policy/hooks.html) | 委派限定范围的任务，观察或约束某个生命周期阶段 |
| [已有宿主](production/host.html) | 在已有会话服务里使用 SDK 事件流，不新建第二个历史写入者 |

### 开始使用

在 Node.js 24 项目里安装与本册一致的版本：

```sh
npm install @zpi-dev/agent-sdk@0.1.65
```

按[快速开始](start/first.html)设置服务端 DeepSeek 密钥，运行第一条查询。接着做[订单助手](workshop/cli.html)：分别输入存在和不存在的订单号，检查真实工具记录。运行真实模型可能收费；网站演示不需要密钥，也不是性能基准。

### 下一步

- 正在实现聊天界面？先选[单次或流式输入](guide/input.html)，再看[怎样把工具请求与工具结果配成一行](events/tool-pair.html)。
- 需要准确的调用契约？打开 [TypeScript SDK 参考](typescript.html)，直接查 [Options](typescript.html#options)、[Query 方法](typescript.html#query-对象)或 [listSessions()](typescript.html#listsessions)。
- 从 Claude Agent SDK 的样例过来？先看[迁移与不支持的能力](guide/migrate.html)，不要直接复制 MCP、权限模式或 CLI 配置。
- 遇到问题？带上版本、最小调用、消息类型和去敏后的错误，到[项目 Issues](https://github.com/1316151417/zpi/issues)报告。不要附上 API Key 或完整私人会话。
