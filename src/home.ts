import "./home.css";
import type { DemoApp } from "./playback";

const pages = {
  zpi: {
    name: "ZPI",
    key: "↵",
    title: ["把任务交给", "回车键。"],
    intro: "在同一处说出需求，看它读文件、改代码，把可运行的结果放回你的桌面。",
    guide: "设计取舍",
    link: "了解设计取舍",
    command: "npx @zpi-dev/desktop",
    platform: "推荐 Node.js 24。桌面端主要在 Apple Silicon Mac 上验证，不支持 Windows。",
    setup: "在终端运行上面的命令。首次打开后，在「设置 → 模型」登录 ChatGPT 或配置 API Key。",
    repo: "https://github.com/1316151417/zpi",
  },
  "zpi-quick-chat": {
    name: "ZPI Quick Chat",
    key: "⌥ Space",
    title: ["叫出来问。", "用完收起。"],
    intro: "读到一句难译的话，不必离开正在看的页面。按 Option + Space 唤起浮窗，翻译完就回到原处。",
    guide: "浮窗与快捷键",
    link: "查看快捷键",
    command: "npx @zpi-dev/quick-chat",
    platform: "需要 Node.js 24 和 Apple Silicon Mac（macOS arm64）。",
    setup:
      "先在本机终端设置 DEEPSEEK_API_KEY，再运行上面的命令。按 Option + Space 显示或隐藏浮窗。不要在网页演示里输入密钥。",
    repo: "https://github.com/1316151417/zpi-quick-chat",
  },
  "zpi-agent-sdk": {
    name: "ZPI Agent SDK",
    key: "query()",
    title: ["一次 query，", "一句问候。"],
    intro: "在 TypeScript 里发起查询，用 for await 读取结果。不必启动桌面应用。",
    guide: "TypeScript 示例",
    link: "看示例代码",
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
  const requested = url.searchParams.get("product") ?? "";
  const product: DemoApp = Object.hasOwn(pages, requested) ? (requested as DemoApp) : "zpi";
  const page = pages[product];
  document.documentElement.dataset.product = product;
  document.title = `${page.name} — ${page.title.join("")}`;
  document.querySelector(`.products a[data-product="${product}"]`)?.setAttribute("aria-current", "page");
  el("headline").replaceChildren(page.title[0], document.createElement("br"), page.title[1]);
  el("intro").textContent = page.intro;
  el("keycap").textContent = page.key;
  el("guide-link").textContent = page.link;
  el("install-link").textContent = `安装 ${page.name}`;
  el("guide-title").textContent = page.guide;
  el("platform").textContent = page.platform;
  el("command").textContent = page.command;
  el("setup").textContent = page.setup;
  el<HTMLAnchorElement>("source-link").href = page.repo;
  el("notes").replaceChildren(el<HTMLTemplateElement>("notes-" + product).content.cloneNode(true));
  const demo = new URL("./demo.html", location.href);
  demo.searchParams.set("app", product);
  demo.searchParams.set("autoplay", matchMedia("(prefers-reduced-motion: reduce)").matches ? "0" : "1");
  const live = el<HTMLIFrameElement>("live");
  live.title = page.name + " 交互演示";
  live.src = demo.href;
  el<HTMLAnchorElement>("standalone").href = demo.href;
  el("copy-command").onclick = async () => {
    try {
      await navigator.clipboard.writeText(page.command);
      el("copy-status").textContent = "命令已复制。";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(el("command"));
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      el("copy-status").textContent = "已选中命令，请使用系统复制快捷键。";
    }
  };
}
