// Published URLs and fragment IDs are an external contract. Map each bookmark to the specific new lesson.
export const legacy = {
  zpi: {
    "tutorial/first-edit": [
      "start/first-edit",
      {
        准备一张可以丢掉的练习纸: "start/first-edit",
        启动并选一个模型: "start/first-model",
        让它做一次可核验的编辑: "start/first-edit",
      },
    ],
    "how-to/background": ["terminal/background"],
    "how-to/conversation": [
      "send/enter",
      {
        继续当前任务: "send/enter",
        fork: "revisions/fork",
        提问卡片在等我做什么: "activity/answer",
        只需要旁边问一句: "revisions/side",
      },
    ],
    "how-to/customize": [
      "commands/create",
      {
        固定问法用命令: "commands/create",
        有步骤的做法用技能: "skills/project",
        跨任务的约定用记忆: "memory/short",
      },
    ],
    "how-to/data-recovery": ["data/storage", { backup: "data/history", 按症状定位: "data/logs" }],
    "how-to/extensions": [
      "plugins/builtins",
      {
        只说明约定: "instructions/rules",
        在一个生命周期事件上做事: "hooks/first",
        明确导入一组能力: "plugins/install",
      },
    ],
    "how-to/files": ["files/search"],
    "how-to/models": [
      "start/first-model",
      {
        "用-api-key-或自定义服务": "models/custom",
        "用-chatgpt-订阅": "models/chatgpt",
        在当前任务切换: "models/switch",
      },
    ],
    "how-to/projects": [
      "projects/new",
      { 在已有目录工作: "projects/new", 用独立工作树试验: "worktrees/create" },
    ],
    "how-to/review": [
      "review/last-turn",
      { "last-turn": "review/last-turn", git: "review/unstaged", "没有-diff-或想恢复旧内容": "review/empty" },
    ],
    "how-to/search-archive": ["organize/search"],
    "how-to/web": ["web/search"],
    "reference/resources": ["lookup/settings"],
    "reference/setup": ["start/install", { providers: "start/first-model" }],
    "reference/shortcuts": ["lookup/shortcuts"],
    "reference/tools": ["tools/catalog"],
    "explanation/history": ["revisions/fork"],
    "explanation/trust": ["start/trust"],
  },
  "zpi-quick-chat": {
    "tutorial/selection": ["start/translate"],
    "how-to/capture": [
      "capture/selection",
      { selection: "capture/selection", clipboard: "capture/clipboard", screenshot: "capture/screenshot" },
    ],
    "how-to/tools": ["capabilities/web"],
    "how-to/troubleshoot": ["help/hotkey"],
    "how-to/window": ["window/pin"],
    "explanation/lifetime": ["window/reset"],
    "reference/limits": ["help/limits"],
    "reference/setup": ["start/install"],
    "reference/shortcuts": ["help/keys"],
  },
  "zpi-agent-sdk": {
    "tutorial/first-query": [
      "start/first",
      { 创建项目: "start/first", 保存并运行: "start/first", "核对结果-不核对问候语": "output/final" },
    ],
    "how-to/cancel": ["output/interrupt"],
    "how-to/custom-tool": ["tools/define"],
    "how-to/resume": ["sessions/resume"],
    "how-to/stream": ["output/stream"],
    "explanation/ownership": ["production/host"],
    "reference/extensions": ["production/resources"],
    "reference/host": [
      "production/host",
      { 公开导出: "api/exports", 驱动已经创建好的会话: "production/host", "result-helper": "api/exports" },
    ],
    "reference/query": ["api/query"],
    "reference/results": ["output/final", { decision: "output/final", events: "api/messages" }],
    "reference/sessions": [
      "api/history",
      { local: "sessions/resume", store: "sessions/mirror", checkpoint: "sessions/checkpoint" },
    ],
    "reference/setup": ["start/environment"],
    "reference/tools": ["api/tools", { permissions: "tools/approve" }],
  },
};
