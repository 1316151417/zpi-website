# 会话存储、历史函数与文件检查点

这里查恢复需要保留的键，以及 `listSessions` 有记录但恢复读不到的常见原因。读历史不需要发模型请求。

## 本地历史与会话函数 {#local}

默认在 `~/.zpi/sdk/sessions/<id>.jsonl`；可用 `zpi.agentDir` 换隔离目录。`cwd` 是任务工作目录，历史辅助函数里叫 `dir`；不是把 `dir` 指到 JSONL 文件夹。`persistSession: false` 不保存会话，不能 resume、continue、fork 或 mirror；不保证用到的工具、插件也不写文件。

| 函数或选项 | 返回或限制 |
| --- | --- |
| `listSessions({ dir?, offset?, limit?, … })`、`getSessionInfo(id, options?)` | 按最近修改时间列元数据；单项不存在返回 `undefined`。`includeWorktrees: true` 被拒绝 |
| `getSessionMessages(id, { includeSystemMessages?, offset?, limit?, … })` | 公开 UUID 与消息，默认不含系统消息；查询不存在是空数组。会话 ID、消息 UUID、工具调用 ID 不通用 |
| `listSubagents(id, scope)`、`getSubagentMessages(id, agentId, scope)` | 查子记录和父调用关联；不是活动后台作业列表 |
| `renameSession(id, title, scope)`、`tagSession(id, tag, scope)`、`deleteSession(id, scope)` | 非空标题；`null` 可清标签。删除不可逆。写操作受会话所有权限制，不可用来改正在使用的记录或绕过 Desktop 宿主 |
| `forkSession(id, { upToMessageId?, title?, … })` | 新 `{ sessionId }`；复制选定历史前缀与有关的已完成子记录，重新关联身份；不复制磁盘文件/旧文件检查点 |
| `resume`、`continue`、`sessionId` | 按 ID 恢复 / 按范围接最近 / 明确新 ID。恢复和继续互斥，二者都不能与新 `sessionId` 并用；`forkSession: true` 需要源会话 |
| `resumeSessionAt` | 需要 resume 或 continue。想保留原来后续历史时必须分叉；外部镜像只支持与分叉组合 |

## 外部镜像 {#store}

`SessionStore` 最少实现异步 `append(key, entries)` 与 `load(key)`（不存在返回 `null`）；保留不透明条目、按稳定 UUID 去重。主键 `{ projectKey, sessionId }`，子项另有 `subpath: "subagents/agent-…"`。项目键默认从绝对 cwd 派生，可显式给 `zpi.projectKey`。应用负责跨进程并发和租户隔离；SDK 的进程内写队列不是分布式锁。

- `listSessions(projectKey)` 支持列表及 continue，`listSessionSummaries` 可加速列表；`foldSessionSummary` 可增量维护摘要。列子记录/分叉需 `listSubkeys`；删除还需要 `delete`。所有辅助函数应传同一适配器与范围。`InMemorySessionStore` 可用来验证接口，进程退出并不耐久。
- 镜像跟在本地成功写入之后。`sessionStoreFlush` 默认 `batched`（按时间/条数/体积冲刷），`eager` 更早提交；轮末、结束时排空。普通 append 失败最多尝试三次，超时不重试；最终报 `system/mirror_error`。本地写失败是执行故障，不是这个告警。
- 恢复时先读适配器；确实没有条目时可尝试本地记录，适配器抛错/超时不能当成未命中。`loadTimeoutMs` 默认 60000。镜像不能和内存会话、文件检查点或宿主自持会话组合。

## 文件检查点 {#checkpoint}

创建公共 Query 时显式 `enableFileCheckpointing: true`。保存用户消息的 UUID，在会话空闲时先 `await run.rewindFiles(uuid, { dryRun: true })`。确认 `canRewind` 与 `filesChanged` 后才考虑实际调用，不可把返回值当作所有文件都安全。只覆盖 SDK 跟踪的 Write/Edit；外部编辑或写入链冲突会拒绝，不可用来回滚 Shell、网络服务或整台电脑。

要看到一条实际分支而不碰默认历史，使用[独立目录分叉示例](../how-to/resume.md)。
