import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { options, nativeOptions, controls, functions } from "../manuals/sdk-contract.mjs";

// Read the distributable declaration tree, not private implementation classes or another SDK's API.
export async function sdkReference(zpi) {
  const { parseSync } = createRequire(resolve(zpi, "package.json"))("rolldown/experimental");
  const base = resolve(zpi, "packages/agent-sdk/dist/types"),
    declarations = new Map();
  const docs = [];
  for (const [prefix, where, files] of [
    [
      "",
      "agent-sdk/src",
      ["index", "host", "query", "types", "define-tool", "sessions", "session-store", "query-result"],
    ],
    [
      "core/",
      "coding-agent/src/core",
      ["sdk", "model-runtime", "session-manager", "settings-manager", "session-state", "types"],
    ],
  ]) {
    for (const name of files) {
      const path = resolve(base, where, name + ".d.ts"),
        source = await readFile(path, "utf8");
      const { program, errors } = parseSync(path, source, { lang: "ts" });
      if (errors.length) throw Error(`Invalid declarations: ${path}`);
      const slice = (n) => source.slice(n.start, n.end);
      declarations.set(
        prefix + name,
        new Map(
          program.body
            .map((n) => n.declaration ?? n)
            .filter((n) => n.id?.name)
            .map((n) => [
              n.id.name,
              {
                text: slice(n),
                members:
                  n.type === "TSInterfaceDeclaration"
                    ? n.body.body.map((m) => ({
                        key: m.key.name,
                        text: slice(m),
                        type: m.typeAnnotation ? slice(m.typeAnnotation.typeAnnotation) : undefined,
                      }))
                    : [],
              },
            ]),
        ),
      );
    }
  }
  const node = (f, n) => {
    const s = declarations.get(f)?.get(n);
    if (!s) throw Error(`No published declaration: ${f}/${n}`);
    return s;
  };
  const compact = (s) =>
    s
      .replace(/\/\*\*[\s\S]*?\*\//g, "")
      .replace(/import\("[^"\n]*"\)\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  const signature = (file, symbol) =>
    node(file, symbol)
      .text.replace(/^(?:export )?(?:declare )?/, "")
      .replace(/import\("[^"\n]*"\)\./g, "");
  const sample = (s) => "```ts\n" + s.trim() + "\n```";
  const code = (s) => "`" + s.replaceAll("|", "\\|") + "`";
  const section = (name) => docs.push("### " + name),
    sub = (name) => docs.push("#### " + name);
  const text = (...p) => docs.push(...p);
  const table = (head, rows) =>
    [head, head.map(() => "---"), ...rows].map((r) => "| " + r.join(" | ") + " |").join("\n");
  function fields(symbol, semantics) {
    const members = node("types", symbol).members;
    const rows = members.map((n) => {
      const key = n.key,
        v = semantics[key];
      if (!v) throw Error(`Missing ${symbol}.${key} documentation`);
      return [
        `<span id="${symbol.toLowerCase()}-${key.toLowerCase()}"></span>${code(key)}`,
        code(compact(n.type)),
        v[0],
        v[1],
      ];
    });
    if (members.length !== Object.keys(semantics).length) throw Error("Outdated " + symbol);
    return table(["字段", "类型", "省略时", "作用与限制"], rows);
  }
  text(
    "适用于 `@zpi-dev/agent-sdk@0.1.65`。此页展示发布包的 TypeScript 签名，以及仅凭类型无法判断的默认行为、错误和生命周期。第一次接入请先运行[快速开始](start/first.html)；已有程序可以直接按符号查阅。",
  );
  section("安装与导入");
  text(
    "在运行代码的 **Node.js 24** 项目中执行 `npm install @zpi-dev/agent-sdk@0.1.65`。使用 `defineTool` 的 TypeBox 示例还需 `npm install typebox@1.3.27`。SDK 与模型提供商分别鉴权；不要在浏览器中打包服务端密钥。",
    sample(
      'import { query, defineTool, type Options } from "@zpi-dev/agent-sdk";\nimport { queryResult } from "@zpi-dev/agent-sdk/host";',
    ),
    "公共包没有 Python、`/core` 或 MCP 入口。[查看迁移差异](guide/migrate.html)。",
  );
  const uses = {
    query: 'const run = query({ prompt: "你好", options: { model: "deepseek", tools: [] } });',
    defineTool:
      "// 将返回的工具实现和名称分别传给这两个选项\nconst options = { tools: [order.name], zpi: { customTools: [order] } };",
    listSessions: "const recent = await listSessions({ dir: process.cwd(), limit: 10 });",
    getSessionInfo: "const title = (await getSessionInfo(id, scope))?.customTitle;",
    getSessionMessages: "const messages = await getSessionMessages(id, { ...scope, offset: 0, limit: 20 });",
    renameSession: 'await renameSession(id, "订单核查", scope);',
    tagSession: 'await tagSession(id, "客服", scope);\nawait tagSession(id, null, scope); // 清除标签',
    forkSession: "const branch = await forkSession(id, { ...scope, upToMessageId: reply.uuid });",
    listSubagents: "const children = await listSubagents(id, scope);",
    getSubagentMessages:
      "const children = await listSubagents(id, scope);\nif (children.length) console.log(await getSubagentMessages(id, children[0], scope));",
    deleteSession: "// id 来自已确认的测试会话，不要用最新一条代替目标 ID\nawait deleteSession(id, scope);",
    foldSessionSummary: "const nextSummary = foldSessionSummary(previous, key, appendedEntries);",
    queryResult:
      'const answer = await queryResult({ prompt: "你好", options: { model: "deepseek", tools: [] } });\nconsole.log(answer.result);',
    nativeStopReason: 'nativeStopReason("tool_use"); // "toolUse"',
  };
  section("函数");
  text(
    "以下用法片段中，`id` 指已记录的会话 ID，`scope` 是与创建时一致的 `{ dir, zpi: { agentDir } }`。每个函数后都有可继续阅读的完整操作。",
  );
  for (const [name, [file, description, params, result, example]] of Object.entries(functions)) {
    sub(name + "()");
    text(
      description +
        "。从 " +
        code(file === "query-result" ? "@zpi-dev/agent-sdk/host" : "@zpi-dev/agent-sdk") +
        " 导入。",
      sample(signature(file, name)),
      `**参数。** ${params}`,
      `**返回与失败。** ${result}`,
      sample(uses[name]),
      `[查看用法：${description}](${example}.html)`,
    );
  }
  section("Options");
  text(
    "传入 `query({ prompt, options })` 的可选对象。没有 UI 替你询问用户。对于纯问答，显式使用 `tools: []`、`persistSession: false`，先验证模型连接。",
    fields("Options", options),
  );
  section("ZpiOptions");
  text(
    "放在 `options.zpi` 下，不是 `query()` 的顶层字段。传 `session` 表示宿主已拥有会话；此时不能再传公共层的工具策略、hooks、轮数和预算选项。",
    fields("ZpiOptions", nativeOptions),
  );
  section("Query 对象");
  text(
    "`Query extends AsyncGenerator<SDKMessage, void>`。同一对象应当只有一个消费循环；`next()` 开始生产消息，`return()` 关闭并等待清理。创建时的同步异常与消费时的失败结果要分别处理。",
  );
  const methods = node("types", "Query").members;
  if (methods.length !== Object.keys(controls).length) throw Error("Outdated Query controls");
  text(
    table(
      ["方法签名", "什么时候用"],
      methods.map((n) => {
        const k = n.key;
        if (!controls[k]) throw Error("Missing " + k);
        return [`<span id="query-${k.toLowerCase()}"></span>${code(compact(n.text))}`, controls[k]];
      }),
    ),
    sample(signature("types", "SDKControlInitializeResponse")),
    sample(signature("core/session-state", "ContextUsage")),
    "`getContextUsage()` 没有已知服务端数据时，部分字段为 null。不要把 null 计作零 token。[初始化练习](lifecycle/initialize.html) · [停止操作对照](lifecycle/controls.html)。",
  );
  section("消息与终态");
  text(
    "先区分 `type`，再按 `subtype` 或内容块判别。下面的初始化、任务进度、镜像告警都属于 system，而不是助手正文。",
    sample(signature("types", "SDKMessage")),
  );
  for (const [symbol, desc] of [
    [
      "SDKSystemMessage",
      "init 提供实际工具、模型和 session_id。兼容字段 mcp_servers 的类型是 never[]，不表示支持 MCP。",
    ],
    ["SDKUserMessage", "输入流可传文本或图片块。用户回显也可承载工具结果；不允许外部输入伪造 tool_result。"],
    ["SDKAssistantMessage", "完整回答携带内容块、用量和停止原因；不要同时把全文和流式增量再拼一遍。"],
    ["RawStreamEvent", "逐块处理 text_delta、thinking_delta 和 input_json_delta；半截 JSON 不得执行。"],
    [
      "SDKResultMessage",
      "每个已处理输入有自己的终态。只有 success 可以读 result；错误读 errors，构造/迭代直接抛出则没有这份对象。",
    ],
    ["SDKCompactBoundaryMessage", "标记上下文压缩边界；不是清空会话文件。"],
    ["SDKMirrorErrorMessage", "镜像追加失败，按 key 标记远端未确认，不要因为模型回答成功就宣布存储成功。"],
  ]) {
    sub(symbol);
    text(desc);
    if (symbol === "SDKResultMessage") text(sample(signature("types", "ResultBase")));
    text(sample(signature("types", symbol)));
  }
  sub("后台任务消息");
  text(
    "任务状态按 task_id 配对，不按消息 UUID；宿主若支持多次运行，再区分 run_id。只有 task_notification 才是该后台项的终态。",
    sample(
      ["TaskMessageBase", "SDKTaskStartedMessage", "SDKTaskProgressMessage", "SDKTaskNotificationMessage"]
        .map((n) => signature("core/types", n))
        .join("\n"),
    ),
  );
  section("工具输入与输出");
  text(
    "工具名区分大小写。工具提出时看 assistant 的 tool_use；执行结果在 user 消息的 tool_result，通过 tool_use_id 关联。`is_error` 属于这次调用，并不自动决定整轮失败。",
    sample(signature("types", "ToolUseBlock") + "\n" + signature("types", "ToolResultBlock")),
    table(
      ["工具", "输入（? 为可选）", "实际返回或注意事项"],
      [
        [
          "Read",
          "`file_path`, `offset?`, `limit?`",
          "返回文本或受支持的图像；offset 从 1 起，limit 以行为单位。",
        ],
        [
          "Write",
          "`file_path`, `content`",
          "写完整 UTF-8 内容，必要时建父目录；不是追加。以文件读回和工具状态核验。",
        ],
        [
          "Edit",
          "`file_path`, `old_string`, `new_string`, `replace_all?`",
          "精确替换。默认旧串必须唯一；无法匹配时读取最新文件再决定。",
        ],
        [
          "Bash",
          "`command`, `description?`, `timeout?`, `run_in_background?`",
          "前台返回命令输出。timeout 是毫秒，最大 600000。后台返回 task_id，不是完成结果。",
        ],
        [
          "TaskOutput",
          "`task_id`, `block?`, `timeout?`",
          "返回 task_id、status 和 output；默认等待最多 30000ms，超时并不停止作业。",
        ],
        ["TaskStop", "`task_id`", "停止同一 Query 的任务；未知 ID 报错。不等同于停止主回复。"],
        [
          "Agent",
          "`description`, `prompt`, `subagent_type`, `run_in_background?`",
          "前台返回子角色结果，后台返回 task_id。必须已配置匹配的角色。",
        ],
        ["Skill", "`skill`, `args?`", "读取选定技能的内容及上下文；需先发现资源且实际装入工具。"],
        ["Glob / Grep", "保留名称", "本版不支持执行；不要写进依赖它们的工作流。"],
      ],
    ),
    "[运行一个自定义工具](tools/define.html) · [按调用 ID 呈现结果](events/tool-pair.html)。",
  );
  section("权限与钩子");
  text(
    "拒绝规则优先，预批准其次，剩余调用才到 canUseTool。拒绝单次调用请返回 deny 和 message；null 不是“等待外部审批”。路径和命令模式不能替代操作系统隔离。",
    sample(signature("types", "CanUseTool") + "\n" + signature("types", "PermissionResult")),
    sample(signature("types", "SDKPermissionDenial")),
  );
  sub("HookCallback");
  text(
    "回调入参按 hook_event_name 判别；实际字段如 tool_name 使用 snake_case。返回的 hookSpecificOutput.hookEventName 必须匹配当前事件。matcher 是正则，组 timeout 单位为秒（默认 30），onFailure 默认 continue。",
    sample(
      ["HookEvent", "HookCallback", "HookCallbackMatcher", "SyncHookJSONOutput"]
        .map((n) => signature("types", n))
        .join("\n"),
    ),
    table(
      ["事件", "输入字段（除 session_id、cwd、transcript_path 外）"],
      [
        ["SessionStart / SessionEnd", "启动来源 source / 结束原因 reason"],
        ["UserPromptSubmit", "prompt"],
        ["PreToolUse", "tool_name、tool_input、tool_use_id"],
        ["PostToolUse / PostToolUseFailure", "上述工具字段，加 tool_response / error"],
        ["Stop", "stop_hook_active、可选 last_assistant_message"],
        ["SubagentStart / SubagentStop", "agent_id、agent_type；停止还有 stop_hook_active 与可选最后文本"],
        ["PreCompact / PostCompact", "trigger（manual 或 auto）、custom_instructions"],
      ],
    ),
    "只观察 SessionEnd、子角色与压缩生命周期时返回 `{}`，不要在这里改写工具输入。[完整钩子示例](policy/hooks.html)。",
  );
  section("会话与存储类型");
  text(
    "创建查询用 cwd；历史 helper 使用 dir 与相同 agentDir / projectKey。外部镜像与原生 TranscriptStore 是两种协议。",
    sample(
      [
        "SDKSessionInfo",
        "SessionMessage",
        "SessionMutationOptions",
        "ListSessionsOptions",
        "GetSessionMessagesOptions",
        "ForkSessionOptions",
      ]
        .map((n) => signature("sessions", n))
        .join("\n"),
    ),
    sample(
      [
        "SessionParentKey",
        "SessionKey",
        "SessionStoreEntry",
        "SessionListEntry",
        "SessionSummaryEntry",
        "SessionStoreFlush",
        "SessionStore",
      ]
        .map((n) => signature("session-store", n))
        .join("\n"),
    ),
    "`InMemorySessionStore` 提供内存实现，适合验收读写协议，不跨进程保存。真实后端须保证同键有序、按 uuid 幂等，单独处理子键。[镜像恢复示例](storage/adapter.html) · [写入失败语义](storage/failures.html)。",
  );
  section("输入内容块与流控制类型");
  text(
    "图片以 base64 内容块传入，工具结果由执行循环产生。对 SDKUserMessage 显式填写 uuid 可以关联用户回显；不要把文件路径文本当成已经上传的图像。",
    sample(
      ["TextBlock", "ImageBlock", "ThinkingBlock", "ContentBlock", "SDKPartialAssistantMessage"]
        .map((n) => signature("types", n))
        .join("\n"),
    ),
    sample(
      ["SlashCommand", "AgentInfo", "ModelInfo", "SDKHookResponseMessage", "SDKControlInterruptResponse"]
        .map((n) => signature("types", n))
        .join("\n"),
    ),
    "SDKControlInterruptResponse 是类型表面允许的形状；当前运行时 interrupt() 返回 undefined。仅当实际存在响应时才可读取字段。",
  );
  section("角色、用量与检查点");
  text(
    sample(
      ["AgentDefinition", "ThinkingConfig", "Usage", "ModelUsage", "RewindFilesResult"]
        .map((n) => signature("types", n))
        .join("\n"),
    ),
    "`usage` 是本轮；`modelUsage` 和 `total_cost_usd` 是会话累计，不能对累计值再次求和。回退只看已追踪的变更，先 dryRun，再按实际 canRewind 决定；它不是对整个目录执行版本回退。",
  );
  section("原生宿主入口");
  text(
    "有自己会话所有者的服务才需要这一层。`ModelRuntime` 来自主入口；`createAgentSession`、`SessionManager`、`SettingsManager` 从 `/host` 导入。",
    sample(
      signature("core/sdk", "createAgentSession") + "\n" + signature("core/sdk", "CreateAgentSessionResult"),
    ),
    table(
      ["对象", "如何使用"],
      [
        ["ModelRuntime", "create() 后注册 provider，再供多个独立 Query 使用。不要跨租户共享私有凭据。"],
        [
          "SessionManager",
          "inMemory(cwd) 创建临时历史；使用已有索引存储时由宿主管理，不能与另一套公共镜像混写。",
        ],
        ["SettingsManager", "inMemory() 用于内存设置；不是历史数据库。"],
        ["HostTaskControl", "stopTask(sessionId, taskId, signal) 必需；subscribe 可选，应返回取消订阅函数。"],
      ],
    ),
    "[宿主接入与释放顺序](production/host.html) · [原生工具与进度](host/native.html)。",
  );
  return docs.join("\n\n") + "\n";
}
