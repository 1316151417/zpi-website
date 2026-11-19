import type {
  BrowserState,
  DesktopBridge,
  PublicSettings,
  SessionRecord,
} from "@source/desktop/shared/bridge.ts";
import { parseFileUrlPath, toFileUrl } from "@source/ui/preview/path.ts";
import {
  availablePresets,
  defaultPreferences,
  modelReasoningLabel,
  toThinking,
} from "@source/desktop/shared/config.ts";
import { demoProviders, defaultSelection as selection } from "./demo-models";
import { defaultShortcuts } from "@source/desktop/shared/shortcuts.ts";
import { defaultAutoArchiveSettings } from "@source/desktop/shared/auto-archive.ts";
import {
  emptyTaskGroups,
  applyTaskGroupCommand,
  reconcileTaskGroups,
} from "@source/desktop/shared/task-groups.ts";
import { defaultMemorySettings } from "@source/plugins/memory/types.ts";
import { defaultPluginSettings } from "@source/plugins/index.ts";
import { emptySession, reduceSession } from "@source/ui/reducer.ts";
import toolDefinitions from "virtual:demo-tools";
import { desktopPluginIds as plugins } from "@source/plugins/index.ts";
import { COMPLEX, CHILD, complexView, exampleLog } from "./complex-task";
import {
  files,
  core,
  DESKTOP,
  PROMPT,
  snake,
  clone,
  id,
  site,
  clipboard,
  openStandalone,
  onTrustedInput,
  previewSandbox,
  previewSrcdoc,
  type FileChange,
} from "./shared";

const callbacks = new Map<string, Set<(...args: any[]) => void>>();
const on = (name: string, callback: (...args: any[]) => void) => {
  if (!callbacks.has(name)) callbacks.set(name, new Set());
  callbacks.get(name)!.add(callback);
  return () => callbacks.get(name)?.delete(callback);
};
const emit = (name: string, value?: any) =>
  callbacks.get(name)?.forEach((callback) => callback(clone(value)));
const settings: PublicSettings = {
  interface: { ...clone(defaultPreferences), showContextUsage: true },
  shortcuts: defaultShortcuts("darwin"),
  autoArchive: clone(defaultAutoArchiveSettings),
  plugins: clone(defaultPluginSettings),
  disabledSkillPaths: [],
  credentialsPersisted: true,
  webSearch: {
    provider: "deepseek",
    enabled: false,
    hasApiKey: true,
    apiKeyLength: 4,
    credentialsPersisted: false,
    credentialsLocked: false,
  },
  providers: clone(demoProviders),
  lastSelection: selection,
};
let projects = [{ id: "desktop", name: "Desktop", path: DESKTOP, updatedAt: Date.now() }];
let sessions: SessionRecord[] = [];
const views = new Map<string, any>();
const drafts = new Map<string, any>();
const runners = new Map<string, any>();
type Browser = { id: string; history: string[]; index: number; guestId?: number; renderedContent?: string };
const browsers = new Map<string, Browser>();
const guests = new Map<number, HTMLElement>();
const terminals = new Map<string, { shell: any; line: string }>();
const watches = new Map<string, string>();
let groups = emptyTaskGroups();
let memorySettings = clone(defaultMemorySettings);
let agents = [
  {
    id: "explore",
    name: "Explore",
    description: "只读探索代码库",
    systemPrompt: "探索代码库，返回相关路径和结论。",
    color: "blue",
    injectAgentsMd: true,
    scope: "built-in",
    enabled: true,
  },
  {
    id: "general",
    name: "general-purpose",
    description: "实现、调试与研究",
    systemPrompt: "完成具体任务。",
    color: "gray",
    injectAgentsMd: true,
    scope: "built-in",
    enabled: true,
  },
];
let hooks: any[] = [];
let commands: any[] = [];
export const isReadOnly = (sid: unknown) => sid === COMPLEX || sid === CHILD;
function requireWritable(sid: string) {
  if (isReadOnly(sid)) throw new Error("复杂任务是只读示例。请切换到演示任务进行操作。");
}
const isEnabled = (key: string) => settings.plugins.enabled[key] !== false;
function toolAvailable(name: string) {
  if (name === "AskUserQuestion") return isEnabled(plugins.questions);
  if (["Agent", "SendMessage"].includes(name)) return isEnabled(plugins.collaboration);
  if (["TaskOutput", "TaskStop"].includes(name))
    return isEnabled(plugins.collaboration) || isEnabled(plugins.background);
  if (name.startsWith("web_"))
    return isEnabled(plugins.web) && settings.webSearch.enabled && settings.webSearch.hasApiKey;
  return true;
}
const unsupportedCalls = new Set<string>();
export const bridgeDiagnostics = { unsupportedCalls, errors: [] as any[] };
const fail = (message: string) => {
  throw new Error(message);
};
const requireSession = (sid: string) => sessions.find((session) => session.id === sid) || fail("会话不存在");
const findModel = (s: typeof selection) =>
  settings.providers.find((p) => p.id === s.provider)?.models.find((m) => m.id === s.modelId);
const selectionFor = (sid?: string): typeof selection =>
  views.get(sid ?? "")?.controls?.selection ?? settings.lastSelection ?? selection;
const controls = (sid?: string, selected = selectionFor(sid)) => {
  const model = findModel(selected);
  const presets = model ? availablePresets(model) : ["none"];
  const runs = views.get(sid)?.runs ?? [];
  const tokens = runs.length
    ? Math.ceil(JSON.stringify(runs.map((r: any) => [r.userMessage, r.orderedBlocks])).length / 3) + 840
    : null;
  return {
    selection: selected,
    presets,
    selectionValid: Boolean(model),
    model: { provider: selected.provider, modelId: selected.modelId },
    thinkingLevel: selected.reasoning,
    lastThinkingLevel: "high",
    thinkingLevels: presets.map((p) => toThinking(p, model)),
    usage: {
      contextWindow: model?.contextWindow ?? 0,
      inputTokens: tokens,
      percent: tokens && model?.contextWindow ? (100 * tokens) / model.contextWindow : null,
      timestamp: runs.at(-1)?.endedAt ?? null,
      source: "unknown",
      estimatedTokens: tokens ?? undefined,
      estimateSource: "local",
      breakdown: tokens
        ? [
            { source: "messages", chars: (tokens - 840) * 3 },
            { source: "system_tools", chars: 1920 },
            { source: "system_prompt", chars: 600 },
          ]
        : [],
      averageCacheHitRate: null,
    },
    diagnostics: [],
  };
};
const snapshot = (sid: string) => ({
  session: requireSession(sid),
  view: views.get(sid),
  seq: views.get(sid).seq,
  controls: controls(sid),
  historyCursor: null,
});
function newSession(projectId: string | null = "desktop", parentSessionId?: string) {
  const session: SessionRecord = {
    id: id("task"),
    projectId,
    parentSessionId,
    cwd: projects.find((p) => p.id === projectId)?.path ?? DESKTOP,
    title: "新任务",
    draft: true,
    status: "completed",
    running: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sessions.push(session);
  views.set(session.id, { ...emptySession(session.id, session.title), controls: controls() });
  return session;
}
function event(sid: string, runId: string, value: any) {
  const previous = views.get(sid);
  if (!previous) return;
  const envelope = { sessionId: sid, runId, seq: previous.seq + 1, activityAt: Date.now(), event: value };
  views.set(sid, reduceSession(previous, envelope));
  emit("onEvents", [envelope]);
  emit("onEvent", envelope);
}
function updateSettings() {
  emit("onSettings", settings);
  return settings;
}
function workspace(sid?: string) {
  const session = sid ? sessions.find((s) => s.id === sid) : null;
  const project = projects.find((p) => p.id === session?.projectId) ?? projects[0];
  return {
    home: core.HOME,
    cwd: session?.cwd || project?.path || DESKTOP,
    projectName: project?.name || "Desktop",
    projectId: project?.id ?? null,
  };
}
function beginTool(sid: string, runId: string, name: string, args: any) {
  const toolCallId = id("tool"),
    messageId = id("assistant"),
    toolCall = { id: toolCallId, type: "toolCall", name, arguments: args };
  event(sid, runId, { type: "message_start", messageId, role: "assistant" });
  event(sid, runId, { type: "block_start", messageId, contentIndex: 0, kind: "tool", toolCall });
  event(sid, runId, { type: "tool_ready", messageId, contentIndex: 0, toolCall });
  event(sid, runId, { type: "tool_start", toolCallId, name, argsText: JSON.stringify(args) });
  return toolCallId;
}
function thinking(sid: string, runId: string, value: string) {
  const messageId = id("thinking");
  event(sid, runId, {
    type: "block_start",
    messageId,
    contentIndex: 0,
    kind: "thinking",
    timestamp: Date.now(),
  });
  event(sid, runId, { type: "block_delta", messageId, contentIndex: 0, delta: value });
  return () => event(sid, runId, { type: "block_end", messageId, contentIndex: 0, timestamp: Date.now() });
}
function endTool(sid: string, runId: string, toolCallId: string, output: string, change?: any) {
  event(sid, runId, {
    type: "tool_end",
    toolCallId,
    output,
    hasFileChange: Boolean(change),
    fileChange: change,
  });
}
function tool(sid: string, runId: string, name: string, args: any, output: string) {
  endTool(sid, runId, beginTool(sid, runId, name, args), output);
}
function text(sid: string, runId: string, value: string, final = false) {
  const messageId = id("assistant");
  event(sid, runId, { type: "message_start", messageId, role: "assistant" });
  event(sid, runId, { type: "block_start", messageId, contentIndex: 0, kind: "text", timestamp: Date.now() });
  event(sid, runId, { type: "block_delta", messageId, contentIndex: 0, delta: value });
  const { provider, modelId } = selectionFor(sid);
  event(sid, runId, {
    type: "message_end",
    messageId,
    message: {
      role: "assistant",
      content: [{ type: "text", text: value }],
      stopReason: final ? "stop" : "toolUse",
      timestamp: Date.now(),
      api: settings.providers.find((p) => p.id === provider)?.api,
      provider,
      model: modelId,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    },
    timestamp: Date.now(),
  });
}
let userRevision = 0;
const snakePath = DESKTOP + "/snake.html";
export const onDemoCompleted = (
  callback: (result: { sid: string; path: string; uninterrupted: boolean }) => void,
) => on("demoCompleted", callback);
for (const name of ["keydown", "keyup"]) {
  window.addEventListener(name, (event) => emit("onShortcutModifier", (event as KeyboardEvent).metaKey));
}
window.addEventListener("blur", () => emit("onShortcutModifier", false));
onTrustedInput(() => userRevision++);
async function start(input: any) {
  const sid = input.sessionId;
  requireWritable(sid);
  const session = requireSession(sid);
  runners.get(sid)?.stop();
  const runId = id("run");
  const capturedRevision = userRevision;
  session.draft = false;
  if (session.title === "新任务") session.title = "演示任务";
  session.running = true;
  session.status = "running";
  session.updatedAt = Date.now();
  event(sid, runId, { type: "session_changed", title: session.title });
  const selected = selectionFor(sid);
  const model = findModel(selected);
  event(sid, runId, {
    type: "started",
    text: PROMPT,
    fileReferences: [],
    attachments: [],
    startedAt: Date.now(),
    modelLabel: `${model?.name ?? selected.modelId} ${modelReasoningLabel(model, selected.reasoning)}`,
  });
  emit("onTasksChanged");
  let finishThinking: (() => void) | undefined,
    writeId = "";
  const runner = new core.DemoRunner((step: any) => {
    if (step.type === "plan") {
      text(sid, runId, "我会先查看桌面，再写入独立的 HTML 游戏并打开预览。");
      finishThinking = thinking(sid, runId, "演示计划：检查目标目录，写入单文件游戏，最后验证产物。");
    }
    if (step.type === "inspect") {
      finishThinking?.();
      finishThinking = undefined;
      tool(
        sid,
        runId,
        "bash",
        { command: "ls ~/Desktop", description: "查看桌面文件" },
        files
          .list(DESKTOP)
          .map((f: any) => f.name)
          .join("\n"),
      );
    }
    if (step.type === "write") writeId = beginTool(sid, runId, "write", { path: snakePath, content: snake });
    if (step.type === "file") {
      files.write(snakePath, snake);
      endTool(sid, runId, writeId, "Successfully wrote snake.html", {
        path: snakePath,
        additions: snake.split("\n").length,
        deletions: 0,
        patchAvailable: true,
      });
      writeId = "";
    }
    if (step.type === "verify")
      tool(
        sid,
        runId,
        "bash",
        { command: "ls -lh ~/Desktop/snake.html", description: "确认游戏文件已生成" },
        "snake.html · 预设演示工具结果",
      );
    if (step.type === "complete") {
      text(
        sid,
        runId,
        `已完成：[打开贪吃蛇游戏](${snakePath})。\n使用方向键或 WASD 移动，空格暂停，也可以使用页面上的方向按钮。`,
        true,
      );
      session.running = false;
      session.status = "completed";
      event(sid, runId, { type: "settled", status: "completed", endedAt: Date.now() });
      event(sid, runId, { type: "controls_changed", controls: controls(sid) });
      emit("onTasksChanged");
      runners.delete(sid);
      emit("demoCompleted", { sid, path: snakePath, uninterrupted: capturedRevision === userRevision });
    }
    if (step.type === "stop") {
      finishThinking?.();
      if (writeId)
        event(sid, runId, {
          type: "tool_end",
          toolCallId: writeId,
          isError: true,
          output: "已停止，未写入文件。",
        });
      session.running = false;
      session.status = "aborted";
      runners.delete(sid);
      event(sid, runId, { type: "settled", status: "aborted", endedAt: Date.now() });
      emit("onTasksChanged");
    }
  });
  runners.set(sid, runner);
  runner.start(PROMPT);
  return { runId };
}
function browserState(browser: Browser): BrowserState {
  const url = browser.history[browser.index];
  return {
    id: browser.id,
    url,
    title: url ? core.basename(url) : "浏览器",
    loading: false,
    back: browser.index > 0,
    forward: browser.index < browser.history.length - 1,
  };
}
const localBrowserPath = (url: string) => {
  const path = parseFileUrlPath(url);
  return path === null ? null : core.normalize(path);
};
function browserRender(browser: Browser, force = false) {
  const guest = browser.guestId === undefined ? undefined : guests.get(browser.guestId);
  if (!guest) return;
  const frame = guest.querySelector("iframe")!;
  const url = browser.history[browser.index];
  if (!url || url === "about:blank") {
    frame.srcdoc = "";
    return;
  }
  try {
    const path = localBrowserPath(url);
    if (path === null) throw new Error("Not a file URL");
    const html = files.read(path);
    if (!force && browser.renderedContent === html && frame.srcdoc) return;
    browser.renderedContent = html;
    frame.srcdoc = previewSrcdoc(html);
  } catch {
    delete browser.renderedContent;
    const message = url.startsWith("file:")
      ? "此虚拟文件不存在或已被清理。重新生成后即可继续预览。"
      : "演示浏览器仅预览虚拟文件。外部网站请使用工具栏的“在外部浏览器打开”。";
    frame.srcdoc = `<body style="font:14px system-ui;padding:24px;color:#777">${message}</body>`;
  }
}
let guestNumber = 0;
export function installWebviewAdapter() {
  const create = document.createElement.bind(document);
  document.createElement = ((tag: string, options?: any) => {
    if (tag !== "webview") return create(tag, options);
    const element = create("div");
    const guestId = ++guestNumber;
    const frame = create("iframe");
    frame.title = "内置浏览器预览";
    frame.setAttribute("sandbox", previewSandbox);
    frame.style.cssText = "width:100%;height:100%;border:0;display:block;background:white";
    element.append(frame);
    (element as any).getWebContentsId = () => guestId;
    guests.set(guestId, element);
    let attempts = 0;
    const ready = () => {
      if (element.isConnected) element.dispatchEvent(new Event("dom-ready"));
      else if (++attempts < 100) setTimeout(ready, 20);
      else guests.delete(guestId);
    };
    setTimeout(ready, 0);
    return element;
  }) as typeof document.createElement;
}
const memoryStatus = () => ({
  shortFiles: [
    {
      scope: "user",
      path: core.HOME + "/.zpi/MEMORY.md",
      exists: true,
      count: 1,
      characters: 14,
      diagnostics: [],
    },
  ],
  long: {
    path: core.HOME + "/.zpi/memory",
    running: false,
    status: "disabled",
    message: "网页演示不调用模型生成记忆。",
    tokens: 0,
    cost: null,
    sources: [],
  },
});
const changes = () =>
  files.stat(DESKTOP + "/snake.html")
    ? [
        {
          id: "snake",
          path: "snake.html",
          status: "added",
          area: "unstaged",
          patchAvailable: true,
          added: snake.split("\n").length,
          removed: 0,
        },
      ]
    : [];
const patch = () =>
  "diff --git a/snake.html b/snake.html\nnew file mode 100644\n--- /dev/null\n+++ b/snake.html\n@@ -0,0 +1," +
  snake.split("\n").length +
  " @@\n" +
  snake
    .split("\n")
    .map((line) => "+" + line)
    .join("\n");
function disposeSession(sid: string) {
  requireWritable(sid);
  runners.get(sid)?.stop();
  sessions = sessions.filter((s) => s.id !== sid);
  views.delete(sid);
}

const methods: Record<string, (...args: any[]) => any> = {
  getSettings: () => settings,
  updatePreferences: (input) => {
    settings.interface = { ...settings.interface, ...input };
    return updateSettings();
  },
  updateShortcuts: (input) => {
    settings.shortcuts = input;
    return updateSettings();
  },
  setShortcutCapture: () => {},
  updateAutoArchive: (input) => {
    settings.autoArchive = input;
    return updateSettings();
  },
  startAutoArchive: () => {},
  runAutoArchive: () => ({ archived: 0, skipped: 0, details: [] }),
  getTaskGroups: () => {
    groups = reconcileTaskGroups(groups, sessions);
    return groups;
  },
  updateTaskGroups: (input) => {
    if ([input.id, input.target?.id].some(isReadOnly)) throw new Error("复杂任务是只读示例。");
    groups = reconcileTaskGroups(groups, sessions);
    groups = applyTaskGroupCommand(
      groups,
      input.type === "create" ? { type: "create", id: id("group"), createdAt: Date.now() } : input,
    );
    return groups;
  },
  listProjects: () => projects,
  addProject: () => {
    const project = {
      id: id("project"),
      name: "demo",
      path: core.HOME,
      updatedAt: Date.now(),
    };
    projects.push(project);
    return project;
  },
  removeProject: (pid) => {
    projects = projects.filter((p) => p.id !== pid);
  },
  reorderProjects: (ids) => {
    projects = ids.map((pid) => projects.find((p) => p.id === pid)).filter(Boolean);
  },
  listRecentSessions: () => sessions.filter((s) => !s.archivedAt && !s.parentSessionId),
  listSessions: (pid) => sessions.filter((s) => s.projectId === pid && !s.archivedAt),
  listArchivedSessions: () =>
    sessions
      .filter((s) => s.archivedAt)
      .map((s) => ({ ...s, projectName: projects.find((p) => p.id === s.projectId)?.name ?? "" })),
  createSession: newSession,
  activateSession: (sid) => {
    const session = requireSession(sid);
    delete session.unreadAt;
    return session;
  },
  getSessionSnapshot: snapshot,
  getHistoryPage: (sid) => ({ view: views.get(sid), cursor: null, calls: 0 }),
  getDraft: (sid) =>
    drafts.get(sid) || {
      text: "",
      fileReferences: [],
      selections: [],
      selection: [0, 0],
      revision: 0,
      warnings: [],
    },
  saveDraft: (sid, draft) => {
    if (!isReadOnly(sid)) drafts.set(sid, draft);
  },
  renameSession: (sid, title) => {
    requireWritable(sid);
    requireSession(sid).title = title;
    event(sid, "", { type: "session_changed", title });
    return requireSession(sid);
  },
  setSessionPinned: (sid, pinned) => {
    requireWritable(sid);
    requireSession(sid).pinnedAt = pinned ? Date.now() : null;
    return requireSession(sid);
  },
  setSessionUnread: (sid) => {
    requireWritable(sid);
    requireSession(sid).unreadAt = Date.now();
  },
  archiveSession: (sid) => {
    requireWritable(sid);
    runners.get(sid)?.stop();
    requireSession(sid).archivedAt = Date.now();
  },
  restoreSession: (sid) => {
    requireWritable(sid);
    delete requireSession(sid).archivedAt;
    return requireSession(sid);
  },
  deleteSession: disposeSession,
  createSideChat: (sid) => {
    requireWritable(sid);
    return newSession(requireSession(sid).projectId, sid);
  },
  closeSideChat: disposeSession,
  forkSession: (sid, runId) => {
    requireWritable(sid);
    const parent = requireSession(sid),
      view = views.get(sid),
      at = view.runs.findIndex((r: any) => r.runId === runId),
      run = view.runs[at];
    if (!run || run.status === "running" || !run.finalAnswerBlockIds.length)
      throw new Error("只能分叉已结束且有完整正文的回复");
    const child = newSession(parent.projectId);
    Object.assign(child, {
      title: `Fork of ${parent.title}`.slice(0, 200),
      draft: false,
      status: run.status,
      cwd: parent.cwd,
    });
    views.set(child.id, {
      ...emptySession(child.id, child.title),
      runs: clone(view.runs.slice(0, at + 1)),
      forkOrigin: { sessionId: sid, runId },
      controls: clone(view.controls),
    });
    emit("onTasksChanged");
    return child;
  },
  readBackgroundTask: (sid, key) => ({
    task: views.get(sid)?.backgroundTasks?.find((t: any) => t.taskId === key),
    output: exampleLog,
    truncated: false,
  }),
  startRun: start,
  submitInput: start,
  abortRun: (input) => {
    requireWritable(input.sessionId);
    runners.get(input.sessionId)?.stop();
  },
  retryModelRequest: (input) => {
    requireWritable(input.sessionId);
    return false;
  },
  editUserMessage: async (sid, _runId, input) => {
    await start({ ...input, sessionId: sid });
    return snapshot(sid);
  },
  setSessionSelection: (sid, value) => {
    requireWritable(sid);
    settings.lastSelection = value;
    views.get(sid).controls = controls(sid, value);
    updateSettings();
    return snapshot(sid);
  },
  listSessionSkills: () => ({ skills: [], diagnostics: [] }),
  listSessionMentions: () => [],
  listCommands: () => [{ name: "compact", description: "压缩上下文" }],
  listSessionCustomCommands: () => ({
    commands,
    diagnostics: [],
    directoryPath: core.HOME + "/.zpi/commands",
    subagents: agents.filter((a) => a.enabled),
  }),
  searchTasks: (query) =>
    sessions.filter((s) => s.title.includes(query)).map((s) => ({ ...s, snippets: [] })),
  getTaskSearchChanges: () => changes(),
  getWorkspaceInfo: workspace,
  readWorkspaceDirectory: (_sid, path) =>
    files
      .list(core.normalize(path || DESKTOP))
      .map((f: any) => ({ path: f.path, name: f.name, type: f.type === "dir" ? "directory" : "file" })),
  readFilePreview: (_sid, path, location) => {
    path = core.normalize(path);
    if (files.stat(path)?.type === "dir") return { path, kind: "directory" };
    return { path, kind: "text", text: files.read(path), truncated: false, location };
  },
  readPreviewRange: (_sid, path, offset, length) =>
    new TextEncoder().encode(files.read(path)).slice(offset, offset + length),
  checkPreviewFiles: (_sid, paths) => paths.map((path) => ({ path, exists: Boolean(files.stat(path)) })),
  searchFiles: (_sid, query) =>
    Object.keys(files.nodes)
      .filter((path) => path.toLowerCase().includes(query.toLowerCase()))
      .map((path) => ({
        path,
        absolutePath: path,
        name: core.basename(path),
        type: files.stat(path).type === "dir" ? "directory" : "file",
      })),
  searchWorkspaceFiles: (_sid, input) => ({
    entries: methods.searchFiles(null, input.query),
    truncated: false,
    incomplete: false,
  }),
  cancelWorkspaceFileSearch: () => {},
  ignoredWorkspacePaths: () => [],
  workspaceGitStatus: () => ({
    summary: { isGitAvailable: true, isRepository: false },
    stagedChanges: [],
    unstagedChanges: changes().map((change) => ({
      path: DESKTOP + "/" + change.path,
      kind: "untracked",
      section: "untracked",
      isUntracked: true,
    })),
  }),
  watchWorkspaceDirectory: (_sid, path) => {
    const key = id("watch");
    watches.set(key, path);
    return { id: key };
  },
  watchReviewDirectory: (_sid, path) => methods.watchWorkspaceDirectory(null, path),
  unwatchWorkspaceDirectory: (key) => watches.delete(key),
  fileAction: async (sid, path, action) => {
    requireWritable(sid);
    path = core.normalize(path);
    if (action === "copy-absolute" || action === "copy-relative")
      return clipboard(action === "copy-relative" ? path.replace(DESKTOP + "/", "") : path);
    if (action === "reveal") {
      site()?.showFiles?.(path);
      return;
    }
    const panes = await import("@source/desktop/renderer/pane-store.ts");
    if (/\.html?$/i.test(path)) await panes.openBrowser(toFileUrl(path), sid);
    else await panes.openFile(sid, path);
  },
  openDirectory: (path) => site()?.showFiles?.(path),
  createBrowser: (url) => {
    const browser = { id: id("browser"), history: [url], index: 0 };
    browsers.set(browser.id, browser);
    return browserState(browser);
  },
  browserAction: (key, action, url) => {
    const browser = browsers.get(key);
    if (!browser) return;
    if (action === "navigate") {
      browser.history.splice(++browser.index, Infinity, url);
    } else if (action === "back" && browser.index > 0) browser.index--;
    else if (action === "forward" && browser.index < browser.history.length - 1) browser.index++;
    browserRender(browser, true);
    emit("onPaneEvent", { type: "browser", state: browserState(browser) });
  },
  browserGuest: (key, guestId) => {
    const browser = browsers.get(key);
    if (browser && browser.guestId !== guestId) {
      browser.guestId = guestId;
      browserRender(browser);
    }
  },
  closeBrowser: (key) => {
    const guestId = browsers.get(key)?.guestId;
    if (guestId !== undefined) guests.delete(guestId);
    browsers.delete(key);
  },
  createTerminal: () => {
    const key = id("terminal");
    terminals.set(key, { shell: new core.Shell(files), line: "" });
    setTimeout(
      () =>
        emit("onPaneEvent", {
          type: "terminal",
          id: key,
          data: "\x1b[90mZPI 网页沙箱 · 不执行本机命令\x1b[0m\r\nDesktop % ",
        }),
      300,
    );
    return { id: key, shell: "/bin/zsh" };
  },
  terminalInput: (key, data) => {
    const terminal = terminals.get(key);
    if (!terminal) return;
    let output = "";
    for (const char of data) {
      if (char === "\r" || char === "\n") {
        const result = terminal.shell.execute(terminal.line);
        terminal.line = "";
        output +=
          "\r\n" +
          (result.clear
            ? "\x1b[2J\x1b[H"
            : result.output.replaceAll("\n", "\r\n") + (result.output ? "\r\n" : "")) +
          core.basename(terminal.shell.cwd) +
          " % ";
        if (result.open) void methods.fileAction(sessions[0]?.id, result.open, "open");
      } else if (char === "\t") {
        const completion = terminal.shell.complete(terminal.line);
        terminal.line = completion.line;
        if (completion.candidates.length) output += "\r\n" + completion.candidates.join("   ") + "\r\n";
        output += "\r\x1b[2K" + core.basename(terminal.shell.cwd) + " % " + terminal.line;
      } else if (char === "\u007f") {
        if (terminal.line) {
          terminal.line = terminal.line.slice(0, -1);
          output += "\b \b";
        }
      } else if (char === "\u0003") {
        terminal.line = "";
        output += "^C\r\nDesktop % ";
      } else if (char >= " ") {
        terminal.line += char;
        output += char;
      }
    }
    emit("onPaneEvent", { type: "terminal", id: key, data: output });
  },
  resizeTerminal: () => {},
  closeTerminal: (key) => terminals.delete(key),
  getChanges: changes,
  getReview: () => ({ entries: changes(), isRepository: false, isGitAvailable: true, watchPaths: [DESKTOP] }),
  readPatch: patch,
  readReviewDiff: () => ({
    path: "snake.html",
    availability: "patch",
    beforeContent: "",
    afterContent: snake,
    patch: patch(),
    summary: null,
  }),
  getGitEnvironment: () => null,
  setNewWorktree: (sid, enabled) => {
    requireWritable(sid);
    requireSession(sid).newWorktree = enabled;
    return requireSession(sid);
  },
  getInstalledEditors: () => [{ id: "finder", name: "Finder", iconDataUrl: "./file-actions/finder.png" }],
  openInEditor: (sid, path) => {
    requireWritable(sid);
    return site()?.showFiles?.(core.normalize(path, workspace(sid).cwd));
  },
  copyText: clipboard,
  copySessionPath: (sid) => clipboard(workspace(sid).cwd),
  openExternal: (url) => {
    if (url.startsWith("file:") || url.startsWith(DESKTOP))
      return openStandalone(core.normalize(url.replace(/^file:\/\//, "")));
    if (!/^https?:\/\//.test(url)) return fail("仅支持 HTTP/HTTPS 网址。");
    window.open(url, "_blank", "noopener,noreferrer");
  },
  previewPrompt: () => ({
    ...workspace(),
    basePrompt: "你是 ZPI，帮助用户完成工作。",
    customInstructions: "",
    prompt: "网页演示使用预设任务，不调用模型。",
  }),
  listTools: () => toolDefinitions.map((tool: any) => ({ ...tool, enabled: toolAvailable(tool.name) })),
  getSkillSettings: () => ({ skills: [], diagnostics: [], directories: [core.HOME + "/.agents/skills"] }),
  readSkill: () => "",
  setSkillEnabled: (path, enabled) => {
    settings.disabledSkillPaths = settings.disabledSkillPaths.filter((p) => p !== path);
    if (!enabled) settings.disabledSkillPaths.push(path);
    return updateSettings();
  },
  getLocalPlugins: () => [],
  setPluginEnabled: (key, enabled) => {
    settings.plugins.enabled[key] = enabled;
    return updateSettings();
  },
  setPluginOptions: (key, value) => {
    settings.plugins.options[key] = value;
    return updateSettings();
  },
  getHooks: () => ({ hooks, plugins: [] }),
  saveHook: (input) => {
    const hook = { ...input, id: input.id || id("hook"), revision: id("revision") };
    hooks = hooks.filter((h) => h.id !== hook.id).concat(hook);
    return { hooks, plugins: [] };
  },
  setHookEnabled: (target, enabled) => {
    const hook = hooks.find((h) => h.id === target.id);
    if (hook) hook.enabled = enabled;
    return { hooks, plugins: [] };
  },
  deleteHook: (target) => {
    hooks = hooks.filter((h) => h.id !== target.id);
    return { hooks, plugins: [] };
  },
  listSubagents: () => ({ agents, diagnostics: [] }),
  saveSubagent: (input) => {
    const agent = { ...input.config, id: input.id || id("agent"), scope: input.scope, enabled: true };
    agents = agents.filter((a) => a.id !== agent.id).concat(agent);
    return { agents, diagnostics: [] };
  },
  deleteSubagent: (key) => {
    agents = agents.filter((a) => a.id !== key);
    return { agents, diagnostics: [] };
  },
  setSubagentEnabled: (key, enabled) => {
    const agent = agents.find((a) => a.id === key);
    if (agent) agent.enabled = enabled;
    return { agents, diagnostics: [] };
  },
  getCustomCommands: () => ({ commands, diagnostics: [], directoryPath: core.HOME + "/.zpi/commands" }),
  createCustomCommand: (input) => {
    const command = {
      ...input,
      id: id("command"),
      filePath: core.HOME + "/.zpi/commands/" + input.name + ".md",
      revision: id("revision"),
      enabled: true,
    };
    commands.push(command);
    return command;
  },
  updateCustomCommand: (input) => {
    const command = commands.find((c) => c.id === input.id);
    Object.assign(command, input, { revision: id("revision") });
    return command;
  },
  deleteCustomCommand: (input) => {
    commands = commands.filter((c) => c.id !== input.id);
  },
  setCustomCommandEnabled: (input) => {
    const command = commands.find((c) => c.id === input.id);
    command.enabled = input.enabled;
    return command;
  },
  discoverCommandImports: () => ({ candidates: [], diagnostics: [] }),
  getMemorySettings: () => memorySettings,
  saveMemorySettings: (input) => {
    memorySettings = input;
    return memorySettings;
  },
  getMemoryStatus: memoryStatus,
  clearLongMemory: memoryStatus,
  checkMemoryNow: memoryStatus,
  openMemoryFile: () => ({
    path: core.HOME + "/.zpi/MEMORY.md",
    content: "# Memory\n\n网页中的记忆示例。",
    exists: true,
  }),
  saveProvider: (input) => {
    const provider = { ...input, id: input.id || id("provider"), hasApiKey: false };
    delete provider.apiKey;
    settings.providers = settings.providers.filter((p) => p.id !== provider.id).concat(provider);
    return updateSettings();
  },
  deleteProvider: (key) => {
    settings.providers = settings.providers.filter((p) => p.id !== key);
    return updateSettings();
  },
  reorderProviders: (ids) => {
    settings.providers = ids.map((key) => settings.providers.find((p) => p.id === key)).filter(Boolean);
    return updateSettings();
  },
  getProviderCredentials: () => ({ apiKey: "" }),
  getWebSearchCredentials: () => ({ apiKey: settings.webSearch.hasApiKey ? "demo" : "" }),
  saveWebSearch: (input) => {
    if (input.apiKey !== undefined) {
      if (input.apiKey.trim() && input.apiKey.trim() !== "demo")
        throw new Error("网页只接受 demo 占位符，无需真实凭据");
      settings.webSearch.hasApiKey = Boolean(input.apiKey.trim());
      settings.webSearch.apiKeyLength = settings.webSearch.hasApiKey ? 4 : 0;
    }
    if (input.enabled !== undefined)
      settings.webSearch.enabled = Boolean(input.enabled) && settings.webSearch.hasApiKey;
    return updateSettings();
  },
  discoverModels: () => ({ models: settings.providers.flatMap((p) => p.models), source: "catalog" }),
  readWebSourceIcon: () => ({}),
  pickAttachments: (sid) => {
    requireWritable(sid);
    return [];
  },
  removeAttachment: requireWritable,
};

files.subscribe(({ paths }: FileChange) => {
  for (const [key, dirPath] of watches) {
    const dir = core.normalize(dirPath);
    if (paths.some((path) => path === dir || path.startsWith(dir === "/" ? dir : dir + "/")))
      emit("directory:" + key, { dirPath });
  }
  for (const browser of browsers.values()) {
    const path = localBrowserPath(browser.history[browser.index]);
    if (path !== null && paths.includes(path)) browserRender(browser);
  }
});
export function createDesktopBridge(): DesktopBridge {
  if (!sessions.length) {
    const demo = newSession("desktop");
    const seededAt = demo.createdAt;
    demo.createdAt = demo.updatedAt = seededAt - 120000;
    demo.title = "演示任务";
    demo.draft = false;
    views.get(demo.id).title = demo.title;
    for (const sid of [COMPLEX, CHILD]) {
      const view = complexView(sid);
      views.set(sid, view);
      view.controls = controls(sid);
      sessions.push({
        ...demo,
        id: sid,
        title: view.title,
        parentSessionId: sid === CHILD ? COMPLEX : undefined,
        // The transcript depicts a running task; the read-only exhibit has no live runner.
        running: false,
        status: "running",
        createdAt: seededAt - 60000,
        updatedAt: seededAt - 60000,
        ...(sid === COMPLEX ? { pendingQuestion: { id: "sample-question" } } : {}),
      });
    }
  }
  return new Proxy(
    { platform: "darwin", workspacePanelRadius: 12 },
    {
      get(target, property: string) {
        if (property in target) return target[property];
        if (property === "logError")
          return (error: any) => {
            bridgeDiagnostics.errors.push(error);
            console.error("[ZPI renderer]", error);
          };
        if (property === "onWorkspaceDirectoryChange")
          return (key, callback) => on("directory:" + key, callback);
        if (property.startsWith("on")) return (callback) => on(property, callback);
        return async (...args: any[]) => {
          try {
            if (!methods[property]) {
              unsupportedCalls.add(property);
              throw new Error(`网页沙箱不执行此本机功能：${property}。`);
            }
            const value = await methods[property](...clone(args));
            return { ok: true, value: clone(value) };
          } catch (error) {
            return {
              ok: false,
              error: {
                code: "invalid_input",
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        };
      },
    },
  ) as DesktopBridge;
}
