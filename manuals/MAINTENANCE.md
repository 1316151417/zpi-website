# 中文手册维护清单（不发布到读者导航）

基线：ZPI 工作区 `59be3dcb018e5e0c9bb55c3045fbc2ff44e4b578`（Desktop 0.3.35、Agent SDK 0.1.65）；Quick Chat `aa5f344c4305428eb6c0b9c0b44977739368d7e4`（0.1.14）。Quick Chat 的 package.json、锁文件及已安装包三者均为 SDK **0.1.63**，不是工作区 0.1.65。网站起点 `22a755f`。这是本地源码核对，不是 npm dist-tag 查询。ZPI 的 `packages/…` 相对工作区；Desktop 行的简写 `src/`、`test/`、`package.json` 相对 `packages/desktop/`，SDK 行相对 `packages/agent-sdk/`。Quick Chat 行相对独立仓库。最后一列是文章路径，相邻的省略项沿用同一分类。

| 产品 / 用户任务 | 真实界面或公开能力 | 核对入口 / 测试 | 文档落点（产品目录下） |
|---|---|---|---|
| ZPI 第一次有把握地改文件 | 添加项目、模型、回复、检查差异 | packages/desktop/bin/cli.mjs；src/renderer/App.tsx、SettingsPage.tsx；test/projects.test.ts、message-actions.test.ts | tutorial/first-edit |
| 安装、系统范围、首次账号 | npm bin、Node/os、预置变量、OAuth、协议/加速 | package.json；src/shared/config.ts；src/main/storage.ts；packages/ai/src/providers/registry.ts；test/provider-protocols.test.ts、chatgpt-auth.test.ts、fast-mode.test.ts | reference/setup、how-to/models |
| 选择项目/工作树、组织任务、分叉/排队/辅助对话 | 项目加号、草稿环境、回复菜单、任务菜单 | src/renderer/App.tsx、SessionToolbar.tsx；src/main/session-host.ts；test/worktrees.test.ts、worktree-cleanup.test.ts、input-queue.test.ts、side-chat.test.ts | how-to/projects、conversation；explanation/history |
| 看刚才改了什么 | 文件已更改、审查来源、快照冲突 | src/shared/review.ts；src/renderer/ReviewPane.tsx；test/git-review.test.ts、file-changes.test.ts、file-rewind.test.ts、changes-pane-dom.test.ts | how-to/review |
| 引用/预览文件、比较与终端 | 右侧面板、新标签、文件树、选区评论、PDF/Office、浏览器 | src/renderer/PaneLauncher.tsx、FileManagerPane.tsx、BrowserPane.tsx；test/file-preview-formats.test.ts、file-comment-drafts.test.ts、terminal-services.test.ts | how-to/files、background |
| 找任务/正文与归档 | 搜索面板、会话查找、已归档任务、自动归档 | src/shared/auto-archive.ts、shortcuts.ts；test/task-search.test.ts、auto-archive-host.test.ts | how-to/search-archive、reference/shortcuts |
| 工具、提问、协作、后台、联网 | 核心 4；问 1；协作 2 + 共享 2；联网 2；bash 覆盖 | packages/coding-agent/src/core/tools；packages/builtin-plugins/src/{assembly,runtime,index}.ts；test/web-session-integration.test.ts、subagents.test.ts、background-task-host.test.ts | reference/tools、how-to/background、how-to/web、explanation/trust |
| 技能、命令、记忆、插件、Hook、上下文 | 设置分类、项目/用户范围、只有相应插件才贡献能力 | src/renderer/ResourceSettings.tsx、CommandSettings.tsx、MemorySettings.tsx、HooksSettings.tsx；test/resources.test.ts、custom-commands.test.ts、memory-settings.test.ts、configured-hooks.test.ts、plugin-policies.test.ts | how-to/customize、how-to/extensions、reference/resources、explanation/history |
| 本地备份/模型故障/数据锁 | 一次写入者、凭据、错误/诊断、数据代、归档不同于删除 | src/main/index.ts、storage.ts；test/storage-host-recovery.test.ts、error-log.test.ts、storage-generation.test.ts | how-to/data-recovery |
| Quick Chat：首次从编辑器译一句 | 获取选区、仅生成草稿、手动发送、恢复焦点 | bin/cli.mjs、src/{mac-capture,capture,main,renderer}.ts；test/capture.test.ts、focus.test.ts | tutorial/selection、how-to/capture |
| 独立启动、环境、热键、失败定位 | 帮助/版本；仅 darwin arm64；注册失败、系统授权 | package.json、src/config.ts、src/main.ts、native/、test/config.test.ts | reference/setup、shortcuts、how-to/troubleshoot |
| 固定/拖放/显隐/新建/退出 | 定位、钉住、隐藏保留、重置/会话结束 | src/{window,main,chat,renderer}.ts；test/window.test.ts、chat.spec.ts | how-to/window、explanation/lifetime |
| 图片、联网与本机工具 | 第一条接受后锁定；无后台 Bash；图片类型、体积与会话限制 | src/{input,chat,web}.ts；test/{input,chat,web}.test.ts；node_modules/@zpi-dev/agent-sdk/dist/index.d.ts + 锁文件 | how-to/tools、reference/limits |
| SDK 第一次查询 / 结果分支 | 公开 ESM 主入口；init、partial、assistant、result 与异常 | packages/agent-sdk/package.json、src/{index,types,query,query-result}.ts；test/query.test.ts | tutorial/first-query、how-to/stream、reference/query、results |
| SDK 运行环境、模型和凭据 | ModelRuntime、provider 注册/选择/预算与真实计价 | src/runtime.ts；packages/coding-agent/src/core/model-runtime.ts；test/runtime.test.ts | reference/setup |
| SDK 工具、权限、扩展和取消 | defineTool、工具名、选择/批准/拒绝、钩子、子任务、close/interrupt | src/{define-tool,tools,permissions,hooks,resources,tasks,validation}.ts；test/{query,tools,resources,tasks}.test.ts | how-to/custom-tool、cancel；reference/tools、extensions |
| SDK 历史、检查点、外部适配器 | 会话函数、SessionStore、镜像错误、ID 归属和恢复 | src/{sessions,session-store,query}.ts；test/{sessions,session-store,query}.test.ts | how-to/resume、reference/sessions、explanation/ownership |
| SDK 原生宿主 | /host 独立导出、持有者策略、存储互斥、stopReason 与结果辅助函数 | src/{host,query-result,query}.ts；packages/coding-agent/src/core/{sdk,session-manager,settings-manager}.ts；test/runtime.test.ts、query.test.ts | reference/host |

### 归档与代码对照

| 历史材料 / 不能照搬的结论 | 当时之后的证据 / 本册处理 |
|---|---|
| `backup/zpi/README.md` 推荐 `npm run docs`；旧链接指向已搬走的 docs | `3205b98` 搬迁；本轮工作区 `package.json` 无此脚本。用户使用本站静态入口，不需克隆源码 |
| `backup/zpi/docs/features/collaboration.md` 写协作提示预设默认为「默认」 | `484ac54`、`packages/builtin-plugins/src/index.ts` 设为 `codex`；不是强制每次调用子智能体 |
| 旧网页或模型截图不可作为当前目录和可用资格 | `46d6407` 更新 OpenAI 预置到 GPT-6.2 系列；`packages/ai/src/providers/{registry.ts,catalog.json}` 决定内置目录，远端账号才决定可调用项 |
| 旧辅助对话截图、普通过载提示不覆盖当前行为 | `98d67ad` 对齐辅助输入框布局；`59be3dc` 为 ChatGPT 结构化 `server_is_overloaded` 增加有界恢复，不承诺所有网络错误都会重试。见 `packages/coding-agent/test/model-recovery.test.ts` |
| `backup/zpi/docs/features/conversations.md` 泛称编辑历史用户消息 | 当前 `packages/desktop/test/message-actions.test.ts` 明确只允许编辑最新一轮；旧回复可作为分叉边界，但不是随意改旧消息 |
| SDK 归档 README 的示例仅输出成功，容易误以为无输出就成功；镜像恢复兜底写「only on null」 | `src/query-result.ts`、`src/sessions.ts` 区分失败、无结果与迭代异常；当前查询恢复在 `null` **或空数组**时可试本地，适配器异常绝不吞掉。SDK 自定义工具例子不依赖不存在的 `orderService` |
| Quick Chat 的归档与相邻 SDK 版本不能混看 | `git diff 0f3f980..aa5f344 -- src bin native` 无执行代码差异；`package.json` 的打包文件列表移走 README/docs，锁文件未变。`package-lock.json` 和已安装包锁定 SDK 0.1.63；不宣称继承 0.1.64 起的新用户消息身份关联 |

### 维护与回归

先比较表中的实现、测试与 `package.json`，再更新 `catalog.mjs`、`versions.md` 和有关页面。`npm run build` 会从 Markdown 重建 `public/manuals/` 并复制到 `dist/manuals/`，不发布这份清单。`npm run test:manuals` 在临时目录验证独立 SDK 制品与示例，再用静态服务器核对所有页面、链接、锚点、三条查找路线和小屏布局。三条路线是：从 Desktop 手册找到「上一轮更改」、从 Quick Chat 手册找到「选区带入尚未发送」及权限、从 SDK 手册找到成功字段/失败字段/直接抛错。需要本地 SDK 已有 `dist/`。不要为验证文档注册全局快捷键、替用户授权、读取个人数据或发送收费请求。
