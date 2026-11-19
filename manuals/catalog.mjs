export const sections = {
  tutorial: ["教程", "第一次用", "按顺序做完一件小事，并检查结果。"],
  "how-to": ["操作指南", "我要做一件事", "从手头的问题出发，找操作步骤和排查方法。"],
  reference: ["参考手册", "查一个准确答案", "查名称、默认值、生效范围和限制。"],
  explanation: ["概念解释", "理解为什么", "弄清看起来相似的操作究竟有何不同。"],
};

export const products = {
  zpi: {
    name: "ZPI Desktop",
    description: "在桌面工作区里管理项目、检查文件改动，保留任务的来龙去脉。",
    baseline: "桌面源码 0.3.35 · 59be3dc",
    picks: ["how-to/review", "tutorial/first-edit", "reference/tools"],
  },
  "zpi-quick-chat": {
    name: "ZPI Quick Chat",
    description: "在原应用选取材料，带进浮窗。核对、发送，再回到手头的工作。",
    baseline: "源码 0.1.14 · aa5f344 · 锁定 SDK 0.1.63",
    picks: ["how-to/capture", "reference/shortcuts", "tutorial/selection", "how-to/tools"],
  },
  "zpi-agent-sdk": {
    name: "ZPI Agent SDK",
    description: "用 TypeScript 发起查询、消费事件，并接入自己的工具与存储。",
    baseline: "SDK 源码 0.1.65 · 59be3dc",
    picks: ["reference/results", "tutorial/first-query", "how-to/custom-tool", "reference/host"],
  },
};
