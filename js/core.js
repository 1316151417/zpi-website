(function (root) {
  "use strict";
  const HOME = "/Users/demo";
  const DESKTOP = HOME + "/Desktop";
  const PROMPT = "编写一个 HTML 版贪吃蛇游戏";
  const seed = () => ({
    "/": { type: "dir" },
    "/Users": { type: "dir" },
    [HOME]: { type: "dir" },
    [DESKTOP]: { type: "dir" },
  });
  function normalize(path, cwd = DESKTOP) {
    path = String(path || ".");
    if (path === "~" || path.startsWith("~/")) path = HOME + path.slice(1);
    if (!path.startsWith("/")) path = cwd + "/" + path;
    const parts = [];
    for (const part of path.split("/")) {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part);
    }
    return "/" + parts.join("/");
  }
  const parent = (path) => path.slice(0, path.lastIndexOf("/")) || "/";
  const basename = (path) => path.split("/").pop() || "/";
  const writablePath = (path) => {
    const absolute = normalize(path);
    if (!absolute.startsWith(HOME + "/")) throw new Error("仅能在用户主目录内修改文件");
    return absolute;
  };
  class FileSystem {
    constructor(snapshot) {
      this.listeners = new Set();
      this.nodes = seed();
      if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
        const valid = Object.entries(snapshot).every(
          ([path, node]) =>
            path.startsWith("/") &&
            normalize(path) === path &&
            node &&
            (node.type === "dir" || (node.type === "file" && typeof node.content === "string")),
        );
        if (valid && Object.keys(snapshot).length < 1000) {
          const nodes = { ...snapshot };
          const roots = Object.keys(seed());
          if (
            roots.every((path) => nodes[path]?.type === "dir") &&
            Object.keys(nodes).every((path) => path === "/" || nodes[parent(path)]?.type === "dir")
          )
            this.nodes = nodes;
        }
      }
    }
    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    emit(paths, entriesChanged = true) {
      const change = { paths, entriesChanged };
      for (const fn of this.listeners) fn(change);
    }
    snapshot() {
      return JSON.parse(JSON.stringify(this.nodes));
    }
    stat(path) {
      return this.nodes[normalize(path)];
    }
    list(path) {
      path = normalize(path);
      if (this.nodes[path]?.type !== "dir") throw new Error("目录不存在：" + path);
      return Object.entries(this.nodes)
        .filter(([p]) => p !== path && parent(p) === path)
        .map(([p, node]) => ({ path: p, name: basename(p), ...node }))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    }
    read(path) {
      path = normalize(path);
      if (this.nodes[path]?.type !== "file") throw new Error("文件不存在：" + path);
      return this.nodes[path].content;
    }
    write(path, content) {
      path = writablePath(path);
      if (this.nodes[parent(path)]?.type !== "dir") throw new Error("父目录不存在");
      if (this.nodes[path]?.type === "dir") throw new Error("不能覆盖文件夹");
      if (String(content).length > 1000000) throw new Error("演示文件不能超过 1 MB");
      const entriesChanged = !this.nodes[path];
      this.nodes[path] = { type: "file", content: String(content) };
      this.emit([path], entriesChanged);
      return path;
    }
    mkdir(path) {
      path = writablePath(path);
      if (this.nodes[path]) throw new Error("名称已存在");
      if (this.nodes[parent(path)]?.type !== "dir") throw new Error("父目录不存在");
      this.nodes[path] = { type: "dir" };
      this.emit([path]);
      return path;
    }
    remove(path) {
      path = normalize(path);
      if (Object.hasOwn(seed(), path)) throw new Error("不能删除演示系统目录");
      if (!this.nodes[path]) throw new Error("文件或目录不存在");
      if (this.nodes[path].type === "dir" && this.list(path).length)
        throw new Error("目录非空，请先删除其中的文件");
      delete this.nodes[path];
      this.emit([path]);
    }
    rename(path, target) {
      path = normalize(path);
      target = writablePath(target);
      if (!this.nodes[path]) throw new Error("文件不存在");
      if (Object.hasOwn(seed(), path)) throw new Error("不能重命名演示系统目录");
      if (this.nodes[target]) throw new Error("目标名称已存在");
      if (target.startsWith(path + "/")) throw new Error("不能移入自身目录");
      if (this.nodes[parent(target)]?.type !== "dir") throw new Error("目标目录不存在");
      const paths = [];
      for (const p of Object.keys(this.nodes)) {
        if (p === path || p.startsWith(path + "/")) {
          const next = target + p.slice(path.length);
          this.nodes[next] = this.nodes[p];
          delete this.nodes[p];
          paths.push(p, next);
        }
      }
      this.emit(paths);
      return target;
    }
    reset() {
      const next = seed();
      const paths = Object.keys(this.nodes).filter((path) => !Object.hasOwn(next, path));
      this.nodes = next;
      this.emit(paths);
    }
  }
  const commandGroups = {
    目录: [
      ["pwd", "显示当前位置"],
      ["ls [path]", "列出项目"],
      ["cd [path]", "切换目录"],
    ],
    文件: [
      ["cat file", "读取文本"],
      ["open path", "打开文件或目录"],
      ["touch file", "创建空文件"],
      ["mkdir dir", "新建目录"],
      ["mv from to", "移动或重命名"],
      ["rm path", "移除文件或空目录"],
      ["echo text [> file]", "输出文字；>> 追加"],
    ],
    会话: [
      ["clear", "清空屏幕"],
      ["date", "显示时间"],
      ["whoami", "显示用户名"],
      ["help", "显示此帮助"],
    ],
  };
  const commandNames = Object.values(commandGroups)
    .flat()
    .map(([usage]) => usage.split(" ")[0])
    .sort();
  const help =
    Object.entries(commandGroups)
      .map(
        ([group, rows]) =>
          group + "\n" + rows.map(([usage, description]) => "  " + usage.padEnd(22) + description).join("\n"),
      )
      .join("\n\n") + "\n\nTab 补全命令或路径；↑ / ↓ 浏览历史。仅操作本页虚拟文件。";
  function tokenize(line) {
    const tokens = [];
    let text = "",
      quote = "",
      active = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = "";
        else if (c === "\\" && quote === '"' && ['"', "\\"].includes(line[i + 1])) text += line[++i];
        else text += c;
      } else if (c === "\\" && i + 1 < line.length) {
        text += line[++i];
        active = true;
      } else if (c === '"' || c === "'") {
        quote = c;
        active = true;
      } else if (/\s/.test(c)) {
        if (active) tokens.push(text);
        text = "";
        active = false;
      } else if (c === ">") {
        if (active) tokens.push(text);
        text = "";
        active = false;
        if (line[i + 1] === ">") {
          tokens.push(">>");
          i++;
        } else tokens.push(">");
      } else {
        text += c;
        active = true;
      }
    }
    if (quote) throw new Error("引号未闭合");
    if (active) tokens.push(text);
    return tokens;
  }
  class Shell {
    constructor(fs) {
      this.fs = fs;
      this.cwd = DESKTOP;
    }
    complete(line, caret = line.length) {
      // Identify the token around the caret, including escaped spaces and unfinished quotes.
      let start = 0,
        quote = "",
        escape = false,
        end = line.length;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (c === "\\" && quote !== "'") {
          escape = true;
          continue;
        }
        if (quote) {
          if (c === quote) quote = "";
          continue;
        }
        if (c === '"' || c === "'") {
          quote = c;
          continue;
        }
        if (/\s|>/.test(c)) {
          if (i >= caret) {
            end = i;
            break;
          }
          start = i + 1;
        }
      }
      const before = line.slice(0, start),
        raw = line.slice(start, caret);
      const prefix = raw.replace(/^["']|["']$/g, "").replace(/\\(.)/g, "$1");
      let candidates;
      if (!before.trim()) candidates = commandNames.filter((c) => c.startsWith(prefix));
      else {
        const slash = prefix.lastIndexOf("/"),
          base = prefix.slice(0, slash + 1),
          name = prefix.slice(slash + 1);
        if (prefix === "~") candidates = ["~/"];
        else {
          let nodes;
          try {
            nodes = this.fs.list(normalize(base || ".", this.cwd));
          } catch {
            nodes = [];
          }
          const directoriesOnly = before.trimStart().startsWith("cd ");
          candidates = nodes
            .filter((n) => n.name.startsWith(name) && (!directoriesOnly || n.type === "dir"))
            .map((n) => base + n.name + (n.type === "dir" ? "/" : ""));
        }
      }
      if (!candidates.length) return { line, caret, candidates };
      let common = candidates[0];
      for (const item of candidates) while (!item.startsWith(common)) common = common.slice(0, -1);
      if (candidates.length > 1 && common.length <= prefix.length) return { line, caret, candidates };
      const rest = line.slice(end),
        unique = candidates.length === 1;
      const replacement =
        common.replace(/([\s\\'">])/g, "\\$1") +
        (unique && !common.endsWith("/") && !/^\s/.test(rest) ? " " : "");
      return {
        line: before + replacement + rest,
        caret: start + replacement.length,
        candidates: unique ? [] : candidates,
      };
    }
    execute(line) {
      try {
        const [command, ...args] = tokenize(line.trim());
        const path = (value) => normalize(value || ".", this.cwd);
        const need = (count, usage) => {
          if (args.length !== count) throw new Error("用法：" + usage);
        };
        if (!command) return { output: "" };
        switch (command) {
          case "help":
            return { output: help };
          case "pwd":
            return { output: this.cwd };
          case "whoami":
            return { output: "demo" };
          case "date":
            return { output: new Date().toLocaleString("zh-CN") };
          case "clear":
            return { output: "", clear: true };
          case "ls":
            return {
              output:
                this.fs
                  .list(path(args.find((a) => !a.startsWith("-"))))
                  .map((n) => n.name + (n.type === "dir" ? "/" : ""))
                  .join("\n") || "（空目录）",
            };
          case "cd": {
            const dest = args.length ? path(args[0]) : HOME;
            if (this.fs.stat(dest)?.type !== "dir") throw new Error("目录不存在");
            this.cwd = dest;
            return { output: "" };
          }
          case "cat":
            need(1, "cat <文件>");
            return { output: this.fs.read(path(args[0])) };
          case "mkdir":
            need(1, "mkdir <目录>");
            this.fs.mkdir(path(args[0]));
            break;
          case "touch":
            need(1, "touch <文件>");
            if (!this.fs.stat(path(args[0]))) this.fs.write(path(args[0]), "");
            break;
          case "rm":
            need(1, "rm <文件或空目录>");
            this.fs.remove(path(args[0]));
            break;
          case "mv":
            need(2, "mv <源> <目标>");
            this.fs.rename(path(args[0]), path(args[1]));
            break;
          case "echo": {
            const index = args.findIndex((a) => a === ">" || a === ">>");
            if (index < 0) return { output: args.join(" ") };
            if (index !== args.length - 2) throw new Error("用法：echo <文字> > <文件>");
            const dest = path(args[index + 1]);
            const prefix = args[index] === ">>" && this.fs.stat(dest) ? this.fs.read(dest) : "";
            this.fs.write(dest, prefix + args.slice(0, index).join(" ") + "\n");
            break;
          }
          case "open":
            need(1, "open <文件>");
            if (!this.fs.stat(path(args[0]))) throw new Error("文件不存在");
            return { output: "", open: path(args[0]) };
          default:
            throw new Error("不支持的命令：" + command + "。输入 help 查看可用命令。");
        }
        return { output: "" };
      } catch (error) {
        return { output: error.message, error: true };
      }
    }
  }
  class DemoRunner {
    constructor(onEvent, options = {}) {
      this.onEvent = onEvent;
      this.setTimer = options.setTimeout || ((callback, delay) => setTimeout(callback, delay));
      this.clearTimer = options.clearTimeout || ((timer) => clearTimeout(timer));
      this.speed = options.speed ?? 1;
      this.timers = [];
      this.id = 0;
      this.running = false;
    }
    start(original = PROMPT) {
      this.stop(false);
      const id = ++this.id;
      this.running = true;
      this.onEvent({ type: "start", id, original, prompt: PROMPT });
      const steps = [
        [700, "plan"],
        [1900, "inspect"],
        [3600, "write"],
        [6200, "file"],
        [7900, "verify"],
        [9800, "complete"],
      ];
      for (const [delay, type] of steps) {
        this.timers.push(
          this.setTimer(() => {
            if (id !== this.id || !this.running) return;
            if (type === "complete") {
              this.running = false;
              this.timers = [];
            }
            this.onEvent({ type, id });
          }, delay * this.speed),
        );
      }
    }
    stop(notify = true) {
      for (const timer of this.timers) this.clearTimer(timer);
      this.timers = [];
      const wasRunning = this.running;
      this.running = false;
      this.id++;
      if (notify && wasRunning) this.onEvent({ type: "stop" });
    }
  }
  const api = { HOME, DESKTOP, PROMPT, normalize, parent, basename, FileSystem, Shell, DemoRunner, tokenize };
  root.ZpiCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
