import "./site.css";
import { core, files, DESKTOP, type FileChange } from "./shared";
import { QuickWindow } from "./quick-window";
import { zpiGeometry } from "./zpi-window";
import { desktopApps } from "./mac-apps";
import "./site-theme";
import { requestedApp, sequence, waitUntil, delay, type DemoApp } from "./playback";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const desktop = $("#desktop"),
  zpiWindow = $("#zpi-native-window"),
  zpiFrame = $<HTMLIFrameElement>("#zpi-frame"),
  quickFrame = $<HTMLIFrameElement>("#quick-frame"),
  infoWindow = $("#info-window");
const homepageProduct = window.frameElement?.getAttribute("data-product-preview");
const phoneLayout = homepageProduct ? matchMedia("(max-width: 540px)") : undefined;
if (homepageProduct) document.documentElement.dataset.homePreview = homepageProduct;
const quickWindow = new QuickWindow(quickFrame, desktop),
  geometry = zpiGeometry(zpiWindow, desktop, $("#zpi-resize"), phoneLayout);
const app = () => (zpiFrame.contentWindow as any)?.zpiDemo;
const url = new URL(location.href),
  initial = requestedApp(url),
  tour = new AbortController();
const rendererFrames = { zpi: zpiFrame, quick: quickFrame };
type Renderer = keyof typeof rendererFrames;
const readyApps = new Set<Renderer>();
let pendingOpen: { product: Renderer; open: () => void } | undefined;
function loadRenderer(product: Renderer) {
  const frame = rendererFrames[product];
  if (!frame.hasAttribute("src")) frame.src = `./${product}.html`;
}
function whenReady(product: Renderer, open: () => void) {
  pendingOpen = undefined;
  if (readyApps.has(product)) open();
  else {
    pendingOpen = { product, open };
    loadRenderer(product);
  }
}
const interrupt = () => {
  pendingOpen = undefined;
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
    `<pre id="sdk-code" aria-label="TypeScript"></pre><form id="sdk-form"><button class="info-button primary">运行</button></form><pre id="sdk-output" role="status">等待运行</pre>`;
  $("#sdk-code").textContent =
    `import { query } from '@zpi-dev/agent-sdk';\n\nfor await (const event of query({\n  prompt: '只回复：${greeting}',\n  options: { persistSession: false },\n})) {\n  if (event.type === 'result' && event.subtype === 'success')\n    console.log(event.result);\n}`;
  const output = $("#sdk-output");
  $<HTMLFormElement>("#sdk-form").onsubmit = (e) => {
    e.preventDefault();
    clearTimeout(sdkTimer);
    output.textContent = "等待回复…";
    sdkTimer = setTimeout(() => {
      output.textContent = greeting;
      const content = $("#info-content");
      if (
        !infoWindow.hidden &&
        output.getBoundingClientRect().bottom > content.getBoundingClientRect().bottom
      )
        content.scrollTop = content.scrollHeight;
    }, 1000);
  };
}
let focusBeforeQuick: Element | null = null;
function shortcut(event: KeyboardEvent) {
  if (event.isComposing || event.repeat || !event.altKey) return;
  if (event.code === "Space") {
    event.preventDefault();
    event.stopPropagation();
    whenReady("quick", () => {
      if (event.shiftKey) quickWindow.api.reset();
      else {
        if (!quickWindow.visible) focusBeforeQuick = document.activeElement;
        quickWindow.toggle();
        if (!quickWindow.visible) (focusBeforeQuick as HTMLElement)?.focus?.();
      }
    });
  } else if (event.shiftKey && ["KeyC", "KeyV", "KeyA"].includes(event.code)) {
    event.preventDefault();
    event.stopPropagation();
    const text = window.getSelection()?.toString() || zpiFrame.contentWindow?.getSelection()?.toString();
    const draft =
      event.code === "KeyC"
        ? text
          ? { text }
          : { error: "网页只能带入本页选中文字。" }
        : event.code === "KeyV"
          ? (navigator.clipboard?.readText?.().then(
              (text) => ({ text }),
              () => ({ error: "请使用粘贴。" }),
            ) ?? { error: "请在输入框粘贴。" })
          : { error: "浏览器不能调用 macOS 框选截图；可以粘贴图片。" };
    whenReady("quick", () => {
      quickWindow.show();
      void Promise.resolve(draft).then((value) => quickWindow.api.draft(value));
    });
  }
}
(window as any).zpiSite = {
  homepageProduct,
  phoneLayout,
  files,
  quickWindow,
  showFiles: mac.showFinder,
  shortcut,
  interrupt,
  ready: (product: Renderer) => {
    readyApps.add(product);
    if (pendingOpen?.product === product) {
      const { open } = pendingOpen;
      pendingOpen = undefined;
      open();
    }
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
  if ((e.target as Element).closest("[data-theme-switch]")) return;
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
    whenReady("zpi", showZpi);
    rememberRoute("zpi");
  }
  if (el.dataset.open === "quick") {
    whenReady("quick", () => quickWindow.toggle());
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
  if (location.hash === "#quick-chat") whenReady("quick", () => quickWindow.show());
  else if (location.hash === "#agent-sdk") sdk();
  else whenReady("zpi", showZpi);
});
async function launch() {
  const signal = tour.signal,
    autoplay =
      url.searchParams.get("autoplay") === "1" ||
      (url.searchParams.get("autoplay") !== "0" && (initial === "zpi" || initial === "all"));
  const products = initial === "all" ? sequence : [initial];
  for (const [index, product] of products.entries()) {
    if (product === "zpi") loadRenderer("zpi");
    if (product === "zpi-quick-chat") loadRenderer("quick");
    await delay(index === 0 ? 1000 : 3000, signal);
    signal.throwIfAborted();
    if (product === "zpi") {
      await waitUntil(() => readyApps.has("zpi"), signal);
      signal.throwIfAborted();
      showZpi();
      if (url.searchParams.get("open") === "snake.html") await app().openFile(DESKTOP + "/snake.html");
      if (autoplay) await app().play(signal);
    } else if (product === "zpi-quick-chat") {
      await waitUntil(() => readyApps.has("quick"), signal);
      signal.throwIfAborted();
      // A sibling demo can take browser focus; keep an unattended embedded tour visible until takeover.
      quickWindow.embeddedPlayback = window.self !== window.top;
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
