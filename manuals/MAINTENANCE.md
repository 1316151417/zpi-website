# 手册维护

手册以当前 Desktop、Quick Chat 和 SDK 的真实实现为准，网站模拟演示不是产品权限或行为契约。只改网站，不改相邻产品。每篇从一个可独立完成的用户问题出发；写清入口、实际操作、可观察结果以及容易误解的边界。

## 原稿和路由

每册的 `overview.md` 是书口。`catalog.mjs` 列出分卷、分组原稿顺序、入门和推荐文章。原稿用 `# group-slug | 分组名` 开分组，`## page-slug | 标题` 开文章。每篇独立生成 `manuals/<产品>/<group-slug>/<page-slug>.html`；正文内的小节从 `###` 开始。代码块原样输出。SDK 的 TypeScript 示例用带文件名的围栏（如 `ts orders.mts`），构建时生成可下载的同一份源码；离线测试从原稿提取所有示例对实际发布包编译，静态测试再逐字比较下载内容。用相对于生成页的 `.html` 链接，勿把机器路径写进读者页面。

`legacy.mjs` 保留发布过的旧路径与小节 ID，指向相应的新课；不要为了改标题而改 slug。导航无需 JS。四个原分类索引继续可访问。生成目录和测试截图不入库。

## 核验产品

| 范围 | 源码对照 |
|---|---|
| Desktop 0.3.37 / SDK 0.1.65 | `../zpi`，提交 `73100e7deda5fe83c0fa2d99035f5535283fd71b` |
| Quick Chat 0.1.14 | `../zpi-quick-chat`，提交 `aa5f344c4305428eb6c0b9c0b44977739368d7e4`；它依赖 SDK 0.1.63 |
| 桌面工作流 | `packages/desktop/src/renderer` 的 App、各设置与面板；`packages/ui/src/components` 的 Conversation、输入候选与消息操作；`desktop/src/main` 的存储、工作树、快照、执行和诊断 |
| 能力与来源 | `packages/builtin-plugins/src`、`packages/coding-agent/src/core/resources.ts`、`desktop/src/shared` 的配置与快捷键 |
| 浮窗 | Quick Chat 的 `src/main.ts`、`chat.ts`、`config.ts`、`capture.ts`、`mac-capture.ts`、`renderer.ts`、`input.ts`、`web.ts` |
| SDK | `packages/agent-sdk/src/{index,types,query,host,query-result,permissions,resources,sessions,session-store,tools}.ts` 和实际发布形状的 `dist` |

修改后运行 `npm run build`、`npm run test:manuals`，涉及 URL 或资源路径时再运行 `npm run test:mounts`。后者在临时目录安装形状的 SDK 制品上离线编译并运行文章示例，再核对静态链接、旧书签、手机目录和导航，不发送真实模型请求，不注册系统快捷键、不读取真实选区。产品版本变化要同步版本页、目录元数据和本清单。
