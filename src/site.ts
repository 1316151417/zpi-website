import "./site.css";
import { core, files, DESKTOP, type FileChange } from "./shared";
import { QuickWindow } from "./quick-window";
import { zpiGeometry } from "./zpi-window";
import { desktopApps } from "./mac-apps";
import sdkIcon from "./agent-sdk.svg";
import { requestedApp, sequence, waitUntil, delay, type DemoApp } from "./playback";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const desktop = $("#desktop"),
  zpiWindow = $("#zpi-native-window"),
  zpiFrame = $<HTMLIFrameElement>("#zpi-frame"),
  quickFrame = $<HTMLIFrameElement>("#quick-frame"),
  infoWindow = $("#info-window");
const quickWindow = new QuickWindow(quickFrame, desktop),
  geometry = zpiGeometry(zpiWindow, desktop, $("#zpi-resize"));
const app = () => (zpiFrame.contentWindow as any)?.zpiDemo;
const url = new URL(location.href),
  initial = requestedApp(url),
  tour = new AbortController(),
  readyApps = new Set<string>();
const interrupt = () => {
  quickWindow.embeddedPlayback = false;
  tour.abort();
};
const stack: HTMLElement[] = [zpiWindow];
const frontmost = () => stack.findLast((win) => !win.hidden);
function updateAppName() {
  const active = frontmost();
  $("#active-app").textContent = active?.dataset.app ?? "访达";
  for (const win of stack) win.toggleAttribute("data-active", win === active && document.hasFocus());
}
function front(win: HTMLElement) {
  const i = stack.indexOf(win);
  if (i !== -1) stack.splice(i, 1);
  stack.push(win);
  stack.forEach((el, n) => {
    if (el !== quickFrame) el.style.zIndex = String(n + 4);
  });
  updateAppName();
}
new MutationObserver(updateAppName).observe(desktop, {
  subtree: true,
  attributes: true,
  attributeFilter: ["hidden"],
});
window.addEventListener("blur", updateAppName);
window.addEventListener("focus", updateAppName);
quickFrame.addEventListener("quick-show", () => front(quickFrame));
let noticeTimer: ReturnType<typeof setTimeout>, sdkTimer: ReturnType<typeof setTimeout>;
function notify(text: string) {
  $("#notice").textContent = text;
  $("#notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("#notice").hidden = true), 4500);
}
const mac = desktopApps(desktop, front, notify);
function showZpi() {
  zpiWindow.hidden = false;
  front(zpiWindow);
  if (!quickWindow.pinned) quickWindow.hide();
}
async function openFile(path: string) {
  showZpi();
  await app()?.ready;
  await app()?.openFile(path);
}
function renderDesktop() {
  $("#desktop-files").replaceChildren(
    ...files.list(DESKTOP).map((f: any) => {
      const btn = document.createElement("button"),
        mark = document.createElement("i");
      btn.className = "desktop-file";
      btn.dataset.file = f.path;
      mark.textContent = f.type === "dir" ? "▰" : f.name.endsWith(".html") ? "</>" : "TXT";
      btn.append(mark, f.name);
      return btn;
    }),
  );
}
files.subscribe(({ paths, entriesChanged }: FileChange) => {
  if (entriesChanged && paths.some((path) => core.parent(path) === DESKTOP)) renderDesktop();
});
renderDesktop();
const greeting = "你好，我是 zpi agent sdk。";
function sdk() {
  infoWindow.hidden = false;
  infoWindow.dataset.app = "ZPI Agent SDK";
  front(infoWindow);
  if ($("#sdk-form")) return;
  $("#info-title").textContent = "ZPI Agent SDK";
  $("#info-content").innerHTML =
    `<div class="sdk-heading"><img src="${sdkIcon}" alt=""><div><small>ZPI AGENT SDK · 示例 01</small><h2>Hello, agent.</h2></div></div><p>运行一次问候。响应为本地模拟，不需要模型凭据。</p><pre id="sdk-code"></pre><form id="sdk-form"><button class="info-button primary">运行示例</button></form><pre id="sdk-output" role="status">等待运行</pre>`;
  $("#sdk-code").textContent =
    `import { query } from '@zpi-dev/agent-sdk';\n\nfor await (const event of query({\n  prompt: '只回复：${greeting}',\n  options: { persistSession: false },\n})) {\n  if (event.type === 'result' && event.subtype === 'success')\n    console.log(event.result);\n}`;
  const output = $("#sdk-output");
  $<HTMLFormElement>("#sdk-form").onsubmit = (e) => {
    e.preventDefault();
    clearTimeout(sdkTimer);
    output.textContent = "等待回复…";
    sdkTimer = setTimeout(() => (output.textContent = greeting), 1000);
  };
}
let focusBeforeQuick: Element | null = null;
function shortcut(event: KeyboardEvent) {
  if (event.isComposing || event.repeat || !event.altKey) return;
  if (event.code === "Space") {
    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      quickWindow.api?.reset();
      quickWindow.show();
    } else {
      if (!quickWindow.visible) focusBeforeQuick = document.activeElement;
      quickWindow.toggle();
      if (!quickWindow.visible) (focusBeforeQuick as HTMLElement)?.focus?.();
    }
  } else if (event.shiftKey && ["KeyC", "KeyV", "KeyA"].includes(event.code)) {
    event.preventDefault();
    event.stopPropagation();
    quickWindow.show();
    if (event.code === "KeyC") {
      const text = window.getSelection()?.toString() || zpiFrame.contentWindow?.getSelection()?.toString();
      quickWindow.api?.draft(text ? { text } : { error: "网页只能带入本页选中文字。" });
    } else if (event.code === "KeyV") {
      if (!navigator.clipboard?.readText) quickWindow.api?.draft({ error: "请在输入框粘贴。" });
      else
        navigator.clipboard.readText().then(
          (text) => quickWindow.api?.draft({ text }),
          () => quickWindow.api?.draft({ error: "请使用粘贴。" }),
        );
    } else quickWindow.api?.draft({ error: "浏览器不能调用 macOS 框选截图；可以粘贴图片。" });
  }
}
(window as any).zpiSite = {
  files,
  notify,
  quickWindow,
  showFiles: mac.showFinder,
  shortcut,
  interrupt,
  ready: (product: string) => {
    readyApps.add(product);
    if (product === "zpi" && url.searchParams.get("open") === "snake.html")
      void openFile(DESKTOP + "/snake.html");
  },
  isZpiFrontmost: () => frontmost() === zpiWindow,
  hideZpi: () => (zpiWindow.hidden = true),
  maximizeZpi: geometry.toggle,
  beginZpiDrag: geometry.drag,
  focusProduct: (product: string) => {
    if (product === "quick") front(quickFrame);
    if (product === "zpi") {
      quickWindow.blur();
      front(zpiWindow);
    }
  },
};
zpiWindow.hidden = initial === "zpi-quick-chat" || initial === "zpi-agent-sdk";
zpiFrame.src = "./zpi.html";
quickFrame.src = "./quick.html";
window.addEventListener(
  "keydown",
  (e) => {
    if (e.isTrusted) interrupt();
    shortcut(e);
  },
  true,
);
infoWindow.addEventListener("pointerdown", () => front(infoWindow));
infoWindow.querySelector("header")!.ondblclick = (e) => {
  if (!(e.target as Element).closest("button")) infoWindow.classList.toggle("zoom");
};
document.addEventListener("pointerdown", (e) => {
  if (e.isTrusted) interrupt();
  if (!(e.target as Element).closest("[data-open=quick]")) quickWindow.blur();
});
window.addEventListener("blur", () =>
  setTimeout(() => {
    if (!document.hasFocus()) quickWindow.blur();
  }, 0),
);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) quickWindow.blur();
});
function rememberRoute(product: DemoApp) {
  const next = new URL(location.href);
  next.searchParams.set("app", product);
  next.hash = "";
  history.replaceState(null, "", next);
}
document.addEventListener("click", (e) => {
  const el = (e.target as Element).closest<HTMLElement>("button");
  if (!el) return;
  if (el.dataset.open === "zpi") {
    showZpi();
    rememberRoute("zpi");
  }
  if (el.dataset.open === "quick") {
    quickWindow.toggle();
    rememberRoute("zpi-quick-chat");
  }
  if (el.dataset.open === "sdk") {
    sdk();
    rememberRoute("zpi-agent-sdk");
  }
  if (el.dataset.file) mac.open(el.dataset.file);
  switch (el.dataset.action) {
    case "files":
      mac.showFinder();
      break;
    case "terminal":
      mac.showTerminal();
      break;
    case "close-info":
      clearTimeout(sdkTimer);
      $("#info-content").replaceChildren();
      infoWindow.classList.remove("zoom");
      infoWindow.hidden = true;
      break;
    case "hide-info":
      infoWindow.hidden = true;
      break;
    case "zoom-info":
      infoWindow.classList.toggle("zoom");
      break;
  }
});
function clock() {
  $("#clock").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
clock();
setInterval(clock, 30000);
window.addEventListener("hashchange", () => {
  interrupt();
  if (location.hash === "#quick-chat") quickWindow.show();
  else if (location.hash === "#agent-sdk") sdk();
  else showZpi();
});
async function launch() {
  const signal = tour.signal,
    autoplay =
      url.searchParams.get("autoplay") === "1" ||
      (url.searchParams.get("autoplay") !== "0" && (initial === "zpi" || initial === "all"));
  for (const product of (initial === "all" ? sequence : [initial]) as DemoApp[]) {
    signal.throwIfAborted();
    if (product === "zpi") {
      showZpi();
      await waitUntil(() => readyApps.has("zpi"), signal);
      if (autoplay) await app().play(signal);
    } else if (product === "zpi-quick-chat") {
      await waitUntil(() => readyApps.has("quick"), signal);
      // A sibling demo can take browser focus; keep an unattended embedded tour visible until takeover.
      quickWindow.embeddedPlayback = autoplay && window.self !== window.top;
      quickWindow.show();
      if (autoplay) await quickWindow.api.play(signal);
    } else {
      sdk();
      if (autoplay) {
        await delay(700, signal);
        $<HTMLFormElement>("#sdk-form").requestSubmit();
        await waitUntil(() => $("#sdk-output")?.textContent === greeting, signal);
      }
    }
    if (!autoplay || initial !== "all") return;
    await delay(1600, signal);
    if (product === "zpi") zpiWindow.hidden = true;
    else if (product === "zpi-quick-chat") quickWindow.hide();
    else infoWindow.hidden = true;
  }
}
void launch().catch((error) => {
  if (!tour.signal.aborted) notify(String(error));
});
