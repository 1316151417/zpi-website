export const sections = {
  tutorial: "教程",
  "how-to": "操作指南",
  reference: "参考手册",
  explanation: "概念解释",
};

export const products = {
  zpi: {
    name: "ZPI Desktop",
    short: "Desktop",
    version: "0.3.37",
    description: "在自己的文件夹里做一项修改，打开差异，亲自验收。",
    start: "start/first-edit",
    parts: [
      ["开始使用", "start"],
      ["在任务里工作", "conversations"],
      ["检查和验证结果", "workbench"],
      ["管理多个任务", "tasks"],
      ["按需开启能力", "capabilities"],
      ["模型、界面与排错", "settings"],
    ],
    picks: [
      "start/first-model",
      "review/last-turn",
      "revisions/fork",
      "documents/element",
      "agents/explore",
      "memory/project",
    ],
    kinds: {
      tutorial: ["start"],
      reference: ["lookup", "data", "usage", "tools"],
      explanation: ["memory", "instructions", "plugins"],
    },
  },
  "zpi-quick-chat": {
    name: "ZPI Quick Chat",
    short: "Quick Chat",
    version: "0.1.14",
    description: "在眼前的应用选一句话，叫出浮窗提问，读完回去。",
    start: "start/translate",
    parts: [["使用浮窗", "handbook"]],
    picks: [
      "capture/selection",
      "capture/screenshot",
      "window/pin",
      "window/reset",
      "capabilities/web",
      "help/hotkey",
    ],
    kinds: { tutorial: ["start"], reference: ["help"], explanation: ["window"] },
  },
  "zpi-agent-sdk": {
    name: "ZPI Agent SDK",
    short: "Agent SDK",
    version: "0.1.65",
    description: "用 TypeScript 发起查询，把结果、工具和会话接进自己的程序。",
    start: "start/first",
    parts: [
      ["第一条查询与常用配方", "build-app"],
      ["做一个真正的应用", "application"],
      ["接消息、工具与批准", "execution"],
      ["管理会话、存储与委派", "state"],
      ["加载扩展与对接宿主", "extensions"],
      ["生产配置与 API 索引", "integrate"],
      ["Agent SDK 指南", "guide"],
      ["开发概念", "concepts"],
    ],
    picks: [
      "workshop/cli",
      "events/tool-pair",
      "policy/hooks",
      "history/undo",
      "storage/adapter",
      "host/owner",
    ],
    kinds: {
      tutorial: ["start", "workshop"],
      reference: ["api", "diagnose"],
      explanation: ["lifecycle", "production", "host"],
    },
  },
};

// The manuscripts are grouped for editing; every ## entry becomes a separate, addressable article.
export function parsePart(source) {
  const groups = [];
  let article;
  for (const line of source.trimEnd().split(/\r?\n/)) {
    const hit = /^(#{1,2}) ([a-z][a-z0-9-]*) \| (.+)$/.exec(line);
    if (hit?.[1] === "#") {
      groups.push({ id: hit[2], title: hit[3], articles: [] });
      article = undefined;
    } else if (hit) {
      if (!groups.length) throw Error("Article without group");
      article = { id: hit[2], title: hit[3], body: "" };
      groups.at(-1).articles.push(article);
    } else if (article) article.body += line + "\n";
    else if (line.trim()) throw Error(`Unexpected manuscript line: ${line}`);
  }
  for (const g of groups) {
    if (!g.articles.length) throw Error(`Empty group: ${g.id}`);
    for (const a of g.articles) {
      a.body = a.body.trim();
      if (!a.body) throw Error(`Empty article: ${a.id}`);
    }
  }
  return groups;
}
