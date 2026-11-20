import "./home.css";
import { currentTheme } from "./site-theme";
import type { DemoApp } from "./playback";

const pages = {
  zpi: {
    name: "ZPI",
    title: ["极简的界面，", "收敛的功能。"],
    intro: "回车就发，不必先选模式。从读、写、编辑、执行四个基础工具开始，其余按需开启。",
    guide: "设计取舍",
    command: "npx @zpi-dev/desktop",
    platform: "推荐 Node.js 24。桌面端主要在 Apple Silicon Mac 上验证，不支持 Windows。",
    setup: "在终端运行上面的命令。首次打开后，在「设置 → 模型」登录 ChatGPT 或配置 API Key。",
    repo: "https://github.com/1316151417/zpi",
  },
  "zpi-quick-chat": {
    name: "ZPI Quick Chat",
    title: ["叫出来问。", "用完收起。"],
    intro: "按 Option + Space 唤起浮窗。翻译眼前这句话，不必离开正在看的页面。",
    guide: "浮窗与快捷键",
    command: "npx @zpi-dev/quick-chat",
    platform: "需要 Node.js 24 和 Apple Silicon Mac（macOS arm64）。",
    setup: "先在本机终端设置 DEEPSEEK_API_KEY，再运行上面的命令。按 Option + Space 显示或隐藏浮窗。",
    repo: "https://github.com/1316151417/zpi-quick-chat",
  },
  "zpi-agent-sdk": {
    name: "ZPI Agent SDK",
    title: ["几行代码。", "接入智能体。"],
    intro: "在 TypeScript 里发起查询，边执行边读取事件。不必自己搭建一套对话循环。",
    guide: "TypeScript 示例",
    command: "npm install @zpi-dev/agent-sdk",
    platform: "需要 Node.js 24。SDK 跨平台，Windows 也可使用。",
    setup: "在项目目录中安装。下方示例使用 DeepSeek；运行前请在本机配置 DEEPSEEK_API_KEY。",
    repo: "https://github.com/1316151417/zpi/tree/main/packages/agent-sdk",
  },
} as const;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const url = new URL(location.href);
if (
  ["app", "autoplay", "open"].some((k) => url.searchParams.has(k)) ||
  ["#zpi", "#quick-chat", "#agent-sdk", "#zpi-quick-chat", "#zpi-agent-sdk", "#all"].includes(url.hash)
) {
  location.replace("./demo.html" + url.search + url.hash);
} else {
  const root = document.documentElement;
  const phone = matchMedia("(max-width: 580px)");
  const stage = document.querySelector(".stage")!;
  const cover = document.querySelector(".cover")!;
  const arrangeInstall = () => {
    if (phone.matches) stage.after(el("install"));
    else cover.append(el("install"));
  };
  arrangeInstall();
  phone.addEventListener("change", arrangeInstall);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const nav = document.querySelector<HTMLElement>(".products")!;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>("a[data-product]")];
  const validProduct = (value: unknown): value is DemoApp =>
    typeof value === "string" && Object.hasOwn(pages, value);
  const fromAddress = () => new URL(location.href).searchParams.get("product");
  const resolveProduct = (state?: DemoApp): DemoApp => {
    const requested = fromAddress() ?? state;
    return validProduct(requested) ? requested : "zpi";
  };
  let current: DemoApp;
  function render(product: DemoApp) {
    if (current === product) return;
    current = product;
    const page = pages[product];
    root.dataset.product = product;
    document.title = `${page.name} — ${page.title.join("")}`;
    for (const link of links) {
      if (link.dataset.product === product) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    el("headline").replaceChildren(page.title[0], document.createElement("br"), page.title[1]);
    el("intro").textContent = page.intro;
    el("guide-title").textContent = page.guide;
    el("platform").textContent = page.platform;
    el("command").textContent = page.command;
    el("setup").textContent = page.setup;
    el("copy-status").textContent = "";
    el("install").querySelector("details")!.open = false;
    el<HTMLAnchorElement>("manual-link").href = `./manuals/${product}/index.html`;
    el<HTMLAnchorElement>("source-link").href = page.repo;
    el("notes").replaceChildren(el<HTMLTemplateElement>("notes-" + product).content.cloneNode(true));
    const demo = new URL("./demo.html", location.href);
    demo.searchParams.set("app", product);
    demo.searchParams.set("autoplay", reduceMotion.matches ? "0" : "1");
    // A fresh browsing context cancels the old tour without adding child-frame history entries.
    const live = document.createElement("iframe");
    live.id = "live";
    live.dataset.productPreview = product;
    live.dataset.themeFrame = "";
    live.title = page.name + " 交互演示";
    live.src = demo.href;
    el("live").replaceWith(live);
    el<HTMLAnchorElement>("standalone").href = demo.href;
    syncStandaloneTheme();
  }
  function syncStandaloneTheme() {
    for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-desktop-link]")) {
      const url = new URL(link.href);
      if (currentTheme() === "dark") url.searchParams.set("theme", "dark");
      else url.searchParams.delete("theme");
      link.href = url.href;
    }
  }
  window.addEventListener("zpi-theme-change", syncStandaloneTheme);
  // A clean URL is a fresh Desktop on reload. A traversal back from another document
  // restores the selected tab even when the browser didn't retain this document in BFCache.
  const traversal =
    (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type ===
    "back_forward";
  const initial = resolveProduct(traversal ? history.state?.homeProduct : undefined);
  render(initial);
  history.replaceState({ ...history.state, homeProduct: initial }, "");
  nav.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-product]");
    if (!link) return;
    event.preventDefault();
    const product = link.dataset.product as DemoApp;
    if (product === current) return;
    const address = new URL(location.href);
    address.searchParams.delete("product");
    history.pushState({ ...history.state, homeProduct: product }, "", address);
    render(product);
  });
  window.addEventListener("popstate", (event) => render(resolveProduct(event.state?.homeProduct)));
  el("copy-command").onclick = async () => {
    const product = current;
    try {
      await navigator.clipboard.writeText(pages[product].command);
      if (current === product) el("copy-status").textContent = "命令已复制。";
    } catch {
      if (current !== product) return;
      const range = document.createRange();
      range.selectNodeContents(el("command"));
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      el("copy-status").textContent = "已选中命令，请使用系统复制快捷键。";
    }
  };
}
