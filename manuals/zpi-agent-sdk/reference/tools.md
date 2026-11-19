# 工具名称、输入与批准顺序

这里查公共 `query` 的工具，而不是桌面主任务的小写工具。只做文本问答时显式给 `tools: []`；不要指望弹窗替你挡住意外的本机操作。

| 名称 | 关键输入 | 实际能力 |
| --- | --- | --- |
| `Read` | `file_path`、可选从 1 起的 `offset`、`limit` | 读取文本或支持的图像 |
| `Write` | `file_path`、`content` | 新建或覆盖 UTF-8 文件，必要时创建父目录 |
| `Edit` | `file_path`、`old_string`、`new_string`、`replace_all?` | 精确替换；默认旧文本必须唯一。不是桌面的 `edits[]` |
| `Bash` | `command`、`description?`、`timeout?`（毫秒，1–600000）、`run_in_background?` | 当前进程权限下执行。后台返回 ID；不要把工具名/路径规则当操作系统沙箱 |
| `TaskOutput`、`TaskStop` | `task_id`；查询还接受 `block?`、`timeout?` | 在所属 Query 内读取/停止后台任务。`run.stopTask(id)` 是程序端对应入口 |
| `Glob`、`Grep` | 保留名称和参数 schema | **占位，执行报「暂不支持」**。出现在工具列表不等于能用 |
| `Skill`、`Agent` | 技能名称；委派时 `description`、`prompt`、`subagent_type`、可选 `run_in_background` | 有相应资源或定义才有实现，且须在选用工具之中。公共 SDK 不自带桌面的搜索、提问和协作插件集合 |

## 批准规则 {#permissions}

1. `tools` 选模型能看见的名称；省略时按实际装配，`{ type: "preset", preset: "claude_code" }` 不是启动外部 CLI。自定义工具先注册 `zpi.customTools`。
2. `disallowedTools` 优先。裸名称拒绝可将其从上下文移除；带参数的规则只拒绝匹配调用。规则可写 `Read` 或 `Read(private/*)` 等；文件按 cwd 解析，Shell 规则匹配参数中的 `command`，不解析任意程序的真实行为。
3. `allowedTools` 是**预先批准**，不是白名单：匹配就跳过回调；其余工具仍可见且在无回调时默认执行。要隐藏其他工具请收窄 `tools`。
4. 其余调用可进入 `canUseTool(name, input, { signal, toolUseID, requestId })`。返回 `{ behavior: "allow", updatedInput? }` 或 `{ behavior: "deny", message, interrupt? }`。改写的参数仍校验；异常或 `null` 不会批准执行。没有通用的外部审批传输。

要让模型只看到一个不访问系统的工具，照着[演示订单指南](../how-to/custom-tool.md)注册并选择它。
