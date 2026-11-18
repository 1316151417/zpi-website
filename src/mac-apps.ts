import { files, core, DESKTOP, type FileChange } from "./shared";
import "./mac-apps.css";

const home = core.HOME as string;
const label = (path: string) =>
  ({ "/": "Macintosh HD", "/Users": "用户", [DESKTOP]: "桌面" })[path] ?? core.basename(path);
const paths = {
  folder: '<path d="M2 7V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>',
  desktop: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 8h20m-16 8h12"/>',
  disk: '<path d="m3 14 3-9h12l3 9"/><rect x="2" y="13" width="20" height="7" rx="2"/><path d="M5 17h6m5 0h2"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M7 5h14M7 12h14M7 19h14M3 5h.1M3 12h.1M3 19h.1"/>',
  doc: '<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8m-8 4h6"/>',
};
const icon = (name: keyof typeof paths) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
const lights = (name: string) =>
  `<div class="lights"><button data-win="close" aria-label="关闭${name}"></button><button data-win="min" aria-label="最小化${name}"></button><button data-win="zoom" aria-label="缩放${name}"></button></div>`;
const interactive = "button,a,input,textarea,select";
export function desktopApps(
  desktop: HTMLElement,
  front: (win: HTMLElement) => void,
  notify: (text: string) => void,
) {
  function windowFor(app: string, name: string, html: string) {
    const win = document.createElement("section");
    win.id = "mac-" + app;
    win.dataset.app = name;
    win.className = "mac-app";
    win.hidden = true;
    win.setAttribute("aria-label", name);
    win.innerHTML = html;
    desktop.append(win);
    win.addEventListener("pointerdown", () => front(win), true);
    win.querySelectorAll<HTMLButtonElement>("[data-win]").forEach(
      (button) =>
        (button.onclick = () => {
          if (button.dataset.win === "zoom") win.classList.toggle("zoom");
          else win.hidden = true;
        }),
    );
    for (const header of win.querySelectorAll<HTMLElement>("[data-titlebar]")) {
      header.ondblclick = (e) => {
        if (!(e.target as Element).closest(interactive)) win.classList.toggle("zoom");
      };
      header.onpointerdown = (e) => {
        if (e.button !== 0 || (e.target as Element).closest(interactive) || win.classList.contains("zoom"))
          return;
        const x = win.offsetLeft,
          y = win.offsetTop,
          sx = e.clientX,
          sy = e.clientY;
        header.setPointerCapture(e.pointerId);
        header.onpointermove = (p) => {
          const maxX = desktop.clientWidth - win.offsetWidth;
          const maxY = desktop.clientHeight - 100;
          win.style.left = Math.max(0, Math.min(maxX, x + p.clientX - sx)) + "px";
          win.style.top = Math.max(0, Math.min(maxY, y + p.clientY - sy)) + "px";
        };
        header.onlostpointercapture = () => (header.onpointermove = null);
      };
    }
    const fit = () => {
      if (!win.hidden && !win.classList.contains("zoom")) {
        win.style.left = Math.max(0, Math.min(win.offsetLeft, desktop.clientWidth - win.offsetWidth)) + "px";
        win.style.top =
          Math.max(0, Math.min(win.offsetTop, desktop.clientHeight - 68 - win.offsetHeight)) + "px";
      }
    };
    window.addEventListener("resize", fit);
    return {
      win,
      show: () => {
        win.hidden = false;
        fit();
        front(win);
      },
    };
  }
  const finder = windowFor(
    "finder",
    "访达",
    `<aside class="finder-sidebar"><header data-titlebar>${lights("访达")}</header><small>个人收藏</small><button data-dir="${DESKTOP}">${icon("desktop")}桌面</button><small>位置</small><button data-dir="/">${icon("disk")}Macintosh HD</button></aside><main class="finder-main"><header class="finder-tools" data-titlebar><div class="finder-pill"><button data-f="back" aria-label="后退">${icon("back")}</button><button data-f="next" aria-label="前进">${icon("next")}</button></div><strong></strong><div class="finder-pill finder-views"><button data-f="grid" aria-label="图标视图">${icon("grid")}</button><button data-f="list" aria-label="列表视图">${icon("list")}</button></div></header><div class="finder-list" role="listbox" aria-label="文件列表"></div><nav class="finder-path" aria-label="路径"></nav><footer class="finder-status"></footer></main>`,
  );
  const fw = finder.win,
    list = fw.querySelector<HTMLElement>(".finder-list")!,
    crumb = fw.querySelector("nav")!;
  let cwd = DESKTOP,
    selected = "",
    history = [cwd],
    index = 0,
    grid = true;
  function renderFiles() {
    if (files.stat(cwd)?.type !== "dir") cwd = DESKTOP;
    if (!files.stat(selected)) selected = "";
    const entries = files.list(cwd);
    fw.querySelector(".finder-tools strong")!.textContent = label(cwd) + " — 本地";
    fw.querySelectorAll<HTMLElement>(".finder-sidebar [data-dir]").forEach((el) =>
      el.classList.toggle(
        "active",
        el.dataset.dir === (cwd === DESKTOP || cwd.startsWith(DESKTOP + "/") ? DESKTOP : "/"),
      ),
    );
    fw.querySelector<HTMLButtonElement>("[data-f=back]")!.disabled = index === 0;
    fw.querySelector<HTMLButtonElement>("[data-f=next]")!.disabled = index === history.length - 1;
    for (const [key, on] of [
      ["grid", grid],
      ["list", !grid],
    ] as const)
      fw.querySelector(`[data-f=${key}]`)!.setAttribute("aria-pressed", String(on));
    list.classList.toggle("as-icons", grid);
    list.replaceChildren(
      ...entries.map((f: any) => {
        const button = document.createElement("button");
        button.setAttribute("role", "option");
        button.dataset.item = f.path;
        button.dataset.kind = f.type;
        button.setAttribute("aria-selected", String(selected === f.path));
        button.innerHTML = icon(f.type === "dir" ? "folder" : "doc");
        const text = document.createElement("span");
        text.textContent = label(f.path);
        button.append(text);
        return button;
      }),
    );
    const chain = ["/"];
    for (const part of cwd.split("/").filter(Boolean)) chain.push(core.normalize(part, chain.at(-1)));
    crumb.replaceChildren(
      ...chain.map((path) => {
        const button = document.createElement("button");
        button.dataset.dir = path;
        button.innerHTML = icon(path === "/" ? "disk" : "folder");
        button.append(label(path));
        return button;
      }),
    );
    fw.querySelector(".finder-status")!.textContent = `${entries.length} 个项目`;
  }
  function navigate(path: string, push = true) {
    if (files.stat(path)?.type !== "dir") return;
    cwd = path;
    selected = "";
    if (push && history[index] !== cwd) {
      history = history.slice(0, index + 1);
      history.push(cwd);
      index++;
    }
    renderFiles();
  }
  function showFinder(path?: string) {
    finder.show();
    if (path && files.stat(path)) {
      if (files.stat(path).type === "dir") navigate(path);
      else {
        navigate(core.parent(path));
        selected = path;
      }
    }
    renderFiles();
  }
  const editor = windowFor(
    "textedit",
    "文本编辑",
    `<header class="mac-title" data-titlebar>${lights("文本编辑")}${icon("doc")}<strong></strong></header><textarea aria-label="文本内容" spellcheck="false"></textarea>`,
  );
  const buffer = editor.win.querySelector("textarea")!;
  let editing = "";
  buffer.oninput = () => {
    if (editing && files.stat(editing)?.type === "file") files.write(editing, buffer.value);
  };
  files.subscribe(({ paths }: FileChange) => {
    if (!editing || !paths.includes(editing)) return;
    if (files.stat(editing)?.type !== "file") {
      editing = "";
      editor.win.hidden = true;
    } else {
      const content = files.read(editing);
      if (content !== buffer.value) buffer.value = content;
    }
  });
  function open(path: string) {
    if (!files.stat(path)) {
      notify("文件不存在");
      return;
    }
    if (files.stat(path).type === "dir") {
      showFinder(path);
      return;
    }
    editing = path;
    buffer.value = files.read(path);
    editor.win.querySelector("strong")!.textContent = core.basename(path);
    editor.show();
    buffer.focus();
    buffer.setSelectionRange(0, 0);
  }
  fw.onclick = (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("button");
    if (!btn) return;
    if (btn.dataset.dir) navigate(btn.dataset.dir);
    if (btn.dataset.item) {
      selected = btn.dataset.item;
      list
        .querySelectorAll<HTMLElement>("button")
        .forEach((el) => el.setAttribute("aria-selected", String(el === btn)));
    }
    switch (btn.dataset.f) {
      case "back":
        navigate(history[--index], false);
        break;
      case "next":
        navigate(history[++index], false);
        break;
      case "grid":
      case "list":
        grid = btn.dataset.f === "grid";
        renderFiles();
        break;
    }
  };
  list.onclick = (e) => {
    if (e.target === list) {
      selected = "";
      renderFiles();
    }
  };
  list.ondblclick = (e) => {
    const path = (e.target as Element).closest<HTMLButtonElement>("button")?.dataset.item;
    if (path) open(path);
  };
  list.onkeydown = (e) => {
    const path = (e.target as Element).closest<HTMLButtonElement>("button")?.dataset.item;
    if (path && ["Enter", " "].includes(e.key)) {
      e.preventDefault();
      open(path);
    }
  };
  files.subscribe(({ paths, entriesChanged }: FileChange) => {
    if (entriesChanged && paths.some((path) => path === cwd || core.parent(path) === cwd)) renderFiles();
  });
  renderFiles();

  const terminal = windowFor(
    "terminal",
    "终端",
    `<header class="mac-title" data-titlebar>${lights("终端")}${icon("folder")}<strong></strong></header><div class="term-screen"><div role="log" aria-label="终端输出"></div><form><label for="term-command"></label><input id="term-command" placeholder=" " aria-label="终端命令" spellcheck="false" autocapitalize="off" autocomplete="off"></form><div class="term-matches" aria-live="polite"></div></div>`,
  );
  const tw = terminal.win,
    shell = new core.Shell(files),
    screen = tw.querySelector<HTMLElement>(".term-screen")!,
    output = tw.querySelector<HTMLElement>("[role=log]")!,
    command = tw.querySelector<HTMLInputElement>("input")!,
    matches = tw.querySelector<HTMLElement>(".term-matches")!;
  const now = new Date(),
    stamp = `${now.toLocaleString("en-US", { weekday: "short" })} ${now.toLocaleString("en-US", { month: "short" })} ${now.getDate()} ${now.toTimeString().slice(0, 8)}`;
  const lines = [`Last login: ${stamp} on ttys003`],
    commands: string[] = [];
  let cursor = 0,
    draft = "";
  shell.cwd = home;
  const prompt = () => `${shell.cwd === home ? "~" : core.basename(shell.cwd)} %`;
  const updateTitle = () => {
    if (!tw.hidden)
      tw.querySelector("strong")!.textContent =
        `${core.basename(shell.cwd)} — -zsh — ${Math.max(1, Math.floor((screen.clientWidth - 20) / 7))}×${Math.max(1, Math.floor((screen.clientHeight - 14) / 15))}`;
  };
  new ResizeObserver(updateTitle).observe(screen);
  const refresh = () => {
    updateTitle();
    tw.querySelector("label")!.textContent = prompt();
    output.replaceChildren();
    if (lines[0]?.startsWith("Last login:")) {
      const login = document.createElement("span");
      login.className = "term-login";
      login.textContent = lines[0];
      output.append(login, lines.slice(1).join("\n"));
    } else output.textContent = lines.join("\n");
    matches.textContent = "";
    screen.scrollTop = screen.scrollHeight;
  };
  refresh();
  tw.querySelector("form")!.onsubmit = (e) => {
    e.preventDefault();
    const value = command.value;
    command.value = "";
    if (!value.trim()) return;
    lines.push(prompt() + " " + value);
    commands.push(value);
    cursor = commands.length;
    draft = "";
    const result = shell.execute(value);
    if (result.clear) lines.length = 0;
    else if (result.output) lines.push(result.output);
    if (lines.length > 250) lines.splice(0, lines.length - 250);
    refresh();
    if (result.open) open(result.open);
  };
  command.oninput = () => (matches.textContent = "");
  command.onkeydown = (e) => {
    if (e.isComposing) return;
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const result = shell.complete(command.value, command.selectionStart ?? command.value.length);
      command.value = result.line;
      command.setSelectionRange(result.caret, result.caret);
      matches.textContent = result.candidates.join("   ");
      screen.scrollTop = screen.scrollHeight;
      return;
    }
    matches.textContent = "";
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (cursor === commands.length) draft = command.value;
      cursor = Math.max(0, Math.min(commands.length, cursor + (e.key === "ArrowUp" ? -1 : 1)));
      command.value = commands[cursor] ?? draft;
    } else if (e.ctrlKey && e.key === "l") {
      e.preventDefault();
      lines.length = 0;
      refresh();
    } else if (e.ctrlKey && e.key === "c" && !window.getSelection()?.toString()) {
      command.value = "";
      lines.push(prompt() + " ^C");
      refresh();
    }
  };
  screen.onclick = () => {
    if (!window.getSelection()?.toString()) command.focus();
  };
  return {
    showFinder,
    open,
    showTerminal: () => {
      terminal.show();
      updateTitle();
      command.focus();
    },
  };
}
