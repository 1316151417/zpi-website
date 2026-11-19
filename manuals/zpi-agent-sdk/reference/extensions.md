# 指令、技能、插件、钩子与子智能体

当你想扩展一次查询，请先确定要加载的是文本、可执行回调，还是单独的一次子查询。它们的装配入口不同。

| 入口 | 支持与限制 |
| --- | --- |
| `settingSources` | 默认 `[]`。`user` 读取 `~/.claude/CLAUDE.md` 及其 skills；`project` 读取项目的 `.claude/CLAUDE.md`、`CLAUDE.md`、`AGENTS.md` 和 `.claude/skills`；`local` 选择项目 `.claude` 范围及 `CLAUDE.local.md`。不是自动加载 ZPI 桌面全部设置 |
| `skills` | `"all"` 或精确名称数组，用于筛选已发现/贡献的技能；独立技能位于 `skills/<目录>/SKILL.md`，含 frontmatter 和非空描述。此资源加载器限制指令/技能文件 1 MiB。仅指定名称不产生技能实现 |
| `plugins` / `zpi.plugins` | 前者为显式 `{ type: "local", path }`，可贡献命令、钩子、技能、Agent 定义；后者为程序内原生插件。加载可执行命令等同授权其使用宿主权限，不是远程市场或插件 UI |
| `agents`、`agent` | 名称映射到含 `description`、`prompt` 的定义，可配置子任务 `tools`、`disallowedTools`、`model`、`effort`、`skills`、`maxTurns`。`agent` 指定具名主代理。子任务继承或显式选已注册模型；本地插件的定义使用命名空间 |
| `forwardSubagentText` | 默认 false。开启才转发子任务消息、携带父 `parent_tool_use_id`；要子任务 delta 还需 `includePartialMessages`。委派不是在父会话里直接继续写一句话 |

**钩子回调。** `hooks` 按事件分组，每组 `{ matcher?, hooks, timeout?, onFailure? }`；matcher 为正则字符串，timeout 单位**秒**（默认 30），失败策略默认 `continue` 或选 `block`。回调接收 `(input, toolUseID, { signal })`，返回 Promise。SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、PostToolUseFailure、Stop 是核心事件；SessionEnd、SubagentStart/Stop、PreCompact/PostCompact 是生命周期事件。不要给仅观察的生命周期回调返回任意控制对象；正常返回 `{}`。常规报告用 `includeHookEvents`，错误仍需处理。

**不要按兼容类型猜能力。** 支持异步函数，不支持把执行转给 `async` 标记的外部 Hook；`canUseTool` 不会因返回 `null` 而进入审批等待。`claude_code` 预设、消息命名和可选字段不等于全部 Claude Code 服务可用。要先确认当前能发现什么，用 [Query 的目录方法](query.md)。
