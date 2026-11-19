import type { Bridge, Snapshot, ToolCall } from "@source/quick/types.ts";
import { validateImages, inputLimits } from "@source/quick/input.ts";
import "@source/quick/style.css";
import "./site-theme";
import "./site-theme.css";
import { clone, core, id, clipboard, site, onTrustedInput } from "./shared";
import type { QuickWindow } from "./quick-window";
import { scenario } from "./quick-scenarios";
import { delay, waitUntil } from "./playback";
import { installSelectionCopy } from "./selection-copy";
installSelectionCopy(".message-text");
onTrustedInput(() => site()?.interrupt?.());

function initial(generation: number): Omit<Snapshot, "expanded" | "pinned"> {
  return {
    generation,
    messages: [],
    busy: false,
    model: "deepseek-flash",
    reasoning: "disable",
    tools: { web: false, bash: false },
    cwd: core.HOME,
  };
}
let state = initial(0);
const standaloneLayout = { expanded: false, pinned: false };
const listeners = new Set<(state: Snapshot) => void>();
const textListeners = new Set<(update: any) => void>();
const draftListeners = new Set<(value: any) => void>();
let pending: ReturnType<typeof setTimeout>;
const controller = (): QuickWindow | undefined => site()?.quickWindow;
function snapshot(): Snapshot {
  const { expanded, pinned } = controller() ?? standaloneLayout;
  return clone({ ...state, expanded, pinned });
}
const sendSnapshot = () => listeners.forEach((listener) => listener(snapshot()));
function reset() {
  clearTimeout(pending);
  state = initial(state.generation + 1);
  const win = controller();
  if (win) win.reset(win.expanded && win.visible);
  else Object.assign(standaloneLayout, { expanded: false, pinned: false });
  sendSnapshot();
}
function stop() {
  if (!state.busy) return;
  clearTimeout(pending);
  state.busy = false;
  Object.assign(state.messages.at(-1)!, { status: "interrupted", endedAt: Date.now() });
  sendSnapshot();
}
function start(input: any) {
  if (input.generation !== state.generation) throw new Error("会话已切换，请重新发送");
  if (state.busy) throw new Error("请先停止当前任务");
  if (input.text.length > inputLimits.textCharacters) throw new Error("文字超过 32000 字，请缩短内容");
  validateImages(input.images || []);
  const task = scenario(state.tools);
  const win = controller();
  if (win) win.setExpanded(true);
  else standaloneLayout.expanded = true;
  state.busy = true;
  state.messages.push({ id: id("user"), role: "user", text: task.prompt, images: input.images || [] });
  const assistant = {
    id: id("assistant"),
    role: "assistant" as const,
    text: "",
    startedAt: Date.now(),
    calls: [] as ToolCall[],
  };
  state.messages.push(assistant);
  sendSnapshot();
  let index = 0;
  const advance = () => {
    if (state.generation !== input.generation || !state.busy) return;
    try {
      task.steps[index++]({
        text(delta) {
          assistant.text += delta;
          textListeners.forEach((listener) =>
            listener({ generation: state.generation, id: assistant.id, delta }),
          );
        },
        call(call) {
          assistant.calls.push(call);
          sendSnapshot();
        },
        offset: () => assistant.text.length,
      });
      if (index < task.steps.length) {
        pending = setTimeout(advance, 950);
        return;
      }
      Object.assign(assistant, { status: "completed", endedAt: Date.now(), answerAt: Date.now() });
    } catch (error) {
      Object.assign(assistant, { status: "error", endedAt: Date.now() });
      state.error = String(error);
    }
    state.busy = false;
    sendSnapshot();
  };
  pending = setTimeout(advance, 850);
}
window.quickChat = {
  onSnapshot: (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
  onText: (callback) => {
    textListeners.add(callback);
    return () => textListeners.delete(callback);
  },
  onDraft: (callback) => {
    draftListeners.add(callback);
    return () => draftListeners.delete(callback);
  },
  async invoke(action, input: any) {
    try {
      switch (action) {
        case "snapshot":
          sendSnapshot();
          break;
        case "send":
          start(input);
          break;
        case "stop":
          stop();
          break;
        case "reset":
          reset();
          break;
        case "hide":
          controller()?.hide();
          break;
        case "quit":
          reset();
          controller()?.hide();
          break;
        case "pin": {
          const win = controller();
          if (win) win.setPinned(input.pinned);
          else standaloneLayout.pinned = standaloneLayout.expanded && Boolean(input.pinned);
          sendSnapshot();
          break;
        }
        case "tools":
          if (state.messages.length) throw new Error("会话开始后工具配置不可更改");
          state.tools = clone(input.tools);
          sendSnapshot();
          break;
        case "resize":
          controller()?.reportLayout(input);
          break;
        case "resize-window":
          controller()?.resize(input);
          break;
        case "preview":
          controller()?.preview(input.open);
          break;
        case "copy":
          await clipboard(input);
          break;
        case "open-url": {
          const url = new URL(input);
          if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅支持 HTTP/HTTPS 链接");
          window.open(url.href, "_blank", "noopener,noreferrer");
          break;
        }
        default:
          throw new Error("此原生功能不能在网页沙箱中执行");
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
} satisfies Bridge;
(window as any).quickDemo = {
  getState: snapshot,
  hasMessages: () => state.messages.length > 0,
  publishLayout: sendSnapshot,
  async play(signal: AbortSignal) {
    const input = document.querySelector<HTMLTextAreaElement>("#input")!;
    const passive = controller()?.embeddedPlayback;
    if (!passive) input.focus({ preventScroll: true });
    await delay(750, signal);
    for (const char of scenario(state.tools).prompt) {
      input.value += char;
      if (!passive) input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(45, signal);
    }
    await delay(400, signal);
    if (passive) {
      // The desktop form refocuses its textarea after a send. An unattended embed must not focus its host.
      start({ generation: state.generation, text: input.value, images: [] });
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else document.querySelector<HTMLFormElement>("#composer")!.requestSubmit();
    await waitUntil(() => state.messages.at(-1)?.status === "completed", signal);
  },
  reset,
  draft: (value) => draftListeners.forEach((listener) => listener(value)),
  focus: () => {
    document.querySelector<HTMLTextAreaElement>("#input")?.focus({ preventScroll: true });
  },
};
await import("@source/quick/renderer.ts");
site()?.ready?.("quick");
window.addEventListener("blur", () =>
  setTimeout(() => {
    if (!document.hasFocus()) controller()?.blur();
  }, 0),
);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) controller()?.blur();
});
document.addEventListener("keydown", (event) => site()?.shortcut?.(event), true);
document.addEventListener("pointerdown", (event) => {
  site()?.focusProduct?.("quick");
  const target = event.target as HTMLElement;
  if (target.closest("button,input,textarea,[data-resize],a")) return;
  for (let node: HTMLElement | null = target; node && node !== document.body; node = node.parentElement) {
    const region = getComputedStyle(node).getPropertyValue("-webkit-app-region");
    if (region === "no-drag") return;
    if (region === "drag") {
      controller()?.drag(event, node);
      return;
    }
  }
});
