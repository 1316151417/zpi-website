// Reader-facing topics, independent of the manuscript filenames and historical URLs.
// Each recipe belongs to one topic. The topic page exposes its recipes without nesting the rail.
export const sdkNavigation = [
  [
    "Agent SDK",
    [
      ["概览", "index"],
      ["快速开始", "start/first", "start/environment"],
      ["从其他 Agent SDK 迁移", "guide/migrate", "diagnose/compatibility"],
      ["故障排除", "diagnose/sequence", "events/failures", "diagnose/retries"],
    ],
  ],
  [
    "构建 Agent",
    [
      [
        "配置你的 Agent",
        "concepts/configuration",
        "start/credentials",
        "models/provider",
        "models/runtime",
        "models/switch",
        "models/thinking",
        "models/transport",
      ],
      ["示例与实作", "guide/examples", "workshop/cli", "workshop/choose"],
    ],
  ],
  [
    "核心概念",
    [
      [
        "Agent 循环如何工作",
        "guide/loop",
        "lifecycle/initialize",
        "lifecycle/consumer",
        "production/context",
      ],
      [
        "使用会话",
        "concepts/sessions",
        "sessions/follow",
        "sessions/resume",
        "history/reopen",
        "history/list",
        "sessions/fork",
        "history/fork-at",
        "history/delete",
      ],
      ["将会话镜像到外部存储", "storage/adapter", "sessions/mirror", "storage/keys", "storage/failures"],
    ],
  ],
  [
    "输入和输出",
    [
      ["单次输入与流式输入", "guide/input", "lifecycle/identity", "lifecycle/image"],
      ["流式输出", "output/stream", "events/partial", "events/tool-pair"],
      ["获取最终结果", "output/final", "events/result-helper"],
      ["结构化输出", "output/structured"],
      ["中断和取消", "lifecycle/controls", "output/interrupt", "output/close", "tools/stop-task"],
    ],
  ],
  [
    "工具与扩展",
    [
      [
        "内置工具",
        "tools/expose",
        "file-tools/read",
        "file-tools/edit",
        "file-tools/bash",
        "file-tools/background",
      ],
      ["自定义工具", "tools/define", "file-tools/tool-errors", "host/native"],
      ["子智能体", "agents/role", "tools/agents", "agents/permissions", "agents/transcripts"],
      ["系统提示词", "resources/prompt", "resources/instructions"],
      ["技能与命令", "resources/skill", "production/resources"],
      ["本地插件", "resources/plugin"],
    ],
  ],
  [
    "控制与观测",
    [
      ["工具权限", "concepts/permissions", "tools/approve", "policy/order", "policy/replacement"],
      ["生命周期钩子", "policy/hooks", "production/hook", "policy/hook-fail"],
      ["文件检查点", "history/undo", "sessions/checkpoint"],
      ["成本、轮数与用量", "events/usage", "production/limits"],
    ],
  ],
  [
    "部署与集成",
    [
      ["在服务端运行 Agent", "guide/hosting"],
      ["接入已有宿主", "production/host", "host/owner", "host/control", "host/ports"],
    ],
  ],
  [
    "API 参考",
    [
      [
        "TypeScript SDK",
        "typescript",
        "api/query",
        "api/messages",
        "api/tools",
        "api/history",
        "api/exports",
      ],
    ],
  ],
];
