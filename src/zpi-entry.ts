import "./renderer-storage";
import { toFileUrl } from "@source/ui/preview/path.ts";
import {
  createDesktopBridge,
  installWebviewAdapter,
  bridgeDiagnostics,
  isReadOnly,
  onDemoCompleted,
} from "./desktop-bridge";
import { PROMPT, onTrustedInput, site } from "./shared";
import { delay, waitUntil } from "./playback";
import { installSelectionCopy } from "./selection-copy";
installSelectionCopy(".markdown-body");
import "./native-chrome.css";

window.zpi = createDesktopBridge();
installWebviewAdapter();
const panes = await import("@source/desktop/renderer/pane-store.ts");
// The reference workspace gives the preview one third of the space beside the task list.
// Keep the upstream splitter in charge after the visitor adjusts it.
const setPaneRatio = (ratio: number) => document.documentElement.style.setProperty("--demo-pane-ratio", String(ratio));
panes.usePane.setState({ ratio: 1 / 3 });
setPaneRatio(panes.usePane.getState().ratio);
panes.usePane.subscribe((state, previous) => {
  if (state.ratio !== previous.ratio) setPaneRatio(state.ratio);
});
await import("@source/desktop/renderer/main.tsx");
const { useStore, drafts, newSession } = await import("@source/desktop/renderer/store.ts");

const native = document.createElement("div");
native.className = "native-window-buttons lights";
native.innerHTML =
  '<button class="native-close" data-win="close" aria-label="关闭 ZPI"></button><button class="native-minimize" data-win="min" aria-label="最小化 ZPI"></button><button class="native-maximize" data-win="zoom" aria-label="缩放 ZPI"></button>';
document.body.append(native);
native.querySelector(".native-close")!.addEventListener("click", () => site()?.hideZpi());
native.querySelector(".native-minimize")!.addEventListener("click", () => site()?.hideZpi());
native.querySelector(".native-maximize")!.addEventListener("click", () => site()?.maximizeZpi());

onTrustedInput(() => site()?.interrupt?.());
onDemoCompleted(({ sid, path, uninterrupted }) => {
  if (
    uninterrupted &&
    useStore.getState().selected === sid &&
    !document.querySelector(".show-settings") &&
    !(window.frameElement as HTMLElement)?.closest("[hidden]") &&
    site()?.isZpiFrontmost() !== false
  )
    void panes.openBrowser(toFileUrl(path), sid);
});

const lockSelector =
  '.user-question-card,.composer-container form,.composer-container [contenteditable],.task-stop,.message-actions [aria-label="分叉"],.message-actions [aria-label="编辑"]';
function lockControl(el: HTMLElement) {
  if (!el.inert) {
    el.dataset.demoLock = "";
    el.inert = true;
  }
}
const addedControls = new MutationObserver((records) => {
  for (const { addedNodes } of records)
    for (const node of addedNodes) {
      if (!(node instanceof HTMLElement) || !node.isConnected) continue;
      if (node.matches(lockSelector)) lockControl(node);
      node.querySelectorAll<HTMLElement>(lockSelector).forEach(lockControl);
    }
});
let locked = false;
function syncExampleLock() {
  const next = isReadOnly(useStore.getState().selected);
  if (locked === next) return;
  locked = next;
  document.body.classList.toggle("demo-read-only", locked);
  if (locked) {
    document.querySelectorAll<HTMLElement>(lockSelector).forEach(lockControl);
    addedControls.observe(document.body, { childList: true, subtree: true });
  } else {
    addedControls.disconnect();
    for (const el of document.querySelectorAll<HTMLElement>("[data-demo-lock]")) {
      el.inert = false;
      delete el.dataset.demoLock;
    }
  }
}
useStore.subscribe(syncExampleLock);
syncExampleLock();
const ready = new Promise<void>((resolve) => {
  if (useStore.getState().ready) resolve();
  else {
    const off = useStore.subscribe((state) => {
      if (state.ready) {
        off();
        resolve();
      }
    });
  }
});
const submit = async (value = PROMPT) => {
  let sid = useStore.getState().selected;
  if (!sid) sid = await newSession();
  if (!sid) return;
  const draft = drafts.get(sid);
  if (draft) drafts.set(sid, { ...draft, text: "", selection: [0, 0] });
  return window.zpi.submitInput({ sessionId: sid, text: value });
};
(window as any).zpiDemo = {
  ready,
  useStore,
  diagnostics: bridgeDiagnostics,
  openFile: async (path: string) => {
    await ready;
    document.querySelector<HTMLButtonElement>(".settings-back")?.click();
    const sid = useStore.getState().selected!;
    if (/\.html?$/.test(path)) await panes.openBrowser(toFileUrl(path), sid);
    else await panes.openFile(sid, path);
  },
  async play(signal: AbortSignal) {
    await ready;
    await delay(1200, signal);
    const sid = useStore.getState().selected!;
    const editor = document.querySelector<HTMLElement>("main [contenteditable=true]")!;
    editor.focus({ preventScroll: true });
    let text = "";
    for (const char of "帮我写一个 HTML 版贪吃蛇游戏") {
      const draft = drafts.get(sid);
      if (!draft || useStore.getState().selected !== sid) return;
      text += char;
      drafts.set(sid, { ...draft, text, selection: [text.length, text.length] });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      signal.throwIfAborted();
      const node = editor.lastChild;
      if (node)
        window
          .getSelection()
          ?.collapse(
            node,
            node.nodeType === Node.TEXT_NODE ? node.textContent!.length : node.childNodes.length,
          );
      await delay(65, signal);
    }
    await delay(450, signal);
    const result = await submit(PROMPT);
    if (!result?.ok) throw Error("演示提交失败");
    await waitUntil(
      () =>
        useStore
          .getState()
          .views.get(sid)
          ?.runs.find((run) => run.runId === result.value.runId)?.status === "completed",
      signal,
    );
  },
};
await ready;
site()?.ready?.("zpi");
document.addEventListener("keydown", (event) => site()?.shortcut?.(event), true);
function titleRegion(target: Element) {
  return (
    !target.closest("button,a,input,textarea,[contenteditable=true],[role=button]") &&
    target.closest(
      ".topbar,.sidebar-drag-space,.settings-titlebar,.settings-sidebar-drag-space,.pane-drag-space",
    )
  );
}
document.addEventListener("pointerdown", (event) => {
  site()?.focusProduct?.("zpi");
  if (titleRegion(event.target as Element)) site()?.beginZpiDrag?.(event);
});
document.addEventListener("dblclick", (event) => {
  if (titleRegion(event.target as Element)) {
    event.preventDefault();
    site()?.maximizeZpi?.();
  }
});
