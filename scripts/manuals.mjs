import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parsePart, products, sections } from "../manuals/catalog.mjs";
import { legacy } from "../manuals/legacy.mjs";
import { sdkNavigation } from "../manuals/sdk-navigation.mjs";
import { functions, options, controls, nativeOptions } from "../manuals/sdk-contract.mjs";
import { sdkReference } from "./sdk-reference.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  input = resolve(root, "manuals"),
  output = resolve(root, "public/manuals");
const esc = (t) =>
  String(t).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const read = (file) => readFile(resolve(input, file), "utf8");
const marks = { zpi: "zpi.svg", "zpi-quick-chat": "quick-chat.svg", "zpi-agent-sdk": "agent-sdk.svg" };
const sdk = "zpi-agent-sdk",
  reference = `${sdk}/typescript.html`;
const slug = (text) =>
  text
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
const icon = (path) =>
  `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const magnifier = icon('<circle cx="10.5" cy="10.5" r="6.8"/><path d="m16 16 4.5 4.5"/>');
const copyIcon = icon('<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 5V4H4v13h1"/>');
const listIcon = icon('<path d="M4 6h16M4 12h11M4 18h7"/>');
export async function buildManuals(quick, zpi = resolve(process.env.ZPI_SOURCE || resolve(root, "../zpi"))) {
  const { createHighlighter } = await import(
    pathToFileURL(createRequire(resolve(zpi, "package.json")).resolve("shiki")).href
  );
  const highlighter = await createHighlighter({
    themes: ["github-dark"],
    langs: ["typescript", "bash", "markdown"],
  });
  const { Marked, Renderer } = await import(
    pathToFileURL(createRequire(resolve(quick, "package.json")).resolve("marked")).href
  );
  const examples = new Map();
  function markdown(source, pagePath) {
    const headings = [],
      ids = new Set(),
      renderer = new Renderer();
    renderer.code = function ({ text, lang: info }) {
      const [lang, file] = (info ?? "").split(/\s+/);
      let download = "";
      if (file) {
        if (
          lang !== "ts" ||
          !pagePath?.startsWith(sdk + "/") ||
          !/^[-a-z0-9]+\.mts$/.test(file) ||
          examples.has(file)
        )
          throw Error(`Invalid or duplicate example: ${file}`);
        examples.set(file, text + "\n");
        download = `<a href="${esc(posix.relative(posix.dirname(pagePath), sdk + "/examples/" + file))}" download="${esc(file)}">下载 ${esc(file)}</a>`;
      }
      const [grammar, label] = {
        ts: ["typescript", "TypeScript"],
        sh: ["bash", "Shell"],
        zsh: ["bash", "zsh"],
        md: ["markdown", "Markdown"],
      }[lang] ?? [undefined, lang || "文本"];
      const code = grammar
        ? highlighter
            .codeToTokensBase(text, { lang: grammar, theme: "github-dark" })
            .map((line) =>
              line.map((t) => `<span style="color:${esc(t.color)}">${esc(t.content)}</span>`).join(""),
            )
            .join("\n")
        : esc(text);
      return `<figure class="listing"><figcaption>${esc(label)}${download}</figcaption><pre tabindex="0" aria-label="${esc(label)} 示例"><code class="language-${esc(lang || "text")}">${code}\n</code></pre></figure>\n`;
    };
    renderer.heading = function ({ text, depth }) {
      const id = slug(text);
      if (!id || ids.has(id)) throw Error(`Duplicate heading: ${text} in ${pagePath}`);
      ids.add(id);
      if (depth <= 3) headings.push({ id, title: text });
      const d = Math.max(2, depth - 1);
      return `<h${d} id="${esc(id)}">${esc(text)}</h${d}>\n`;
    };
    return { body: new Marked({ renderer, gfm: true }).parse(source), headings };
  }
  const books = {};
  for (const [id, spec] of Object.entries(products)) {
    const actual = (await readdir(resolve(input, id))).sort(),
      expected = ["overview.md", ...spec.parts.map(([, f]) => f + ".md")].sort();
    if (actual.join() !== expected.join()) throw Error(`Unlisted manuscript: ${id}`);
    const b = (books[id] = {
      ...spec,
      id,
      home: `${id}/index.html`,
      byKey: new Map(),
      sections: [],
      all: [],
    });
    function add(a) {
      if (b.byKey.has(a.key) || legacy[id][a.key]) throw Error(`Duplicate article ${id}/${a.key}`);
      b.byKey.set(a.key, a);
      return a;
    }
    const index = add({
      key: "index",
      path: b.home,
      title: id === sdk ? "Agent SDK 概览" : `${b.short} 概览`,
      body: await read(id + "/overview.md"),
    });
    for (const [part, file] of spec.parts)
      for (const g of parsePart(await read(`${id}/${file}.md`))) {
        const items = g.articles.map((a) =>
          add({ ...a, key: g.id + "/" + a.id, path: `${id}/${g.id}/${a.id}.html`, group: g.id, part }),
        );
        b.sections.push([g.title, items.map((a) => [a.title, a.key])]);
      }
    if (id === sdk) {
      add({
        key: "typescript",
        title: "TypeScript SDK 参考",
        group: "api",
        path: reference,
        body: await sdkReference(zpi),
      });
      b.sections = sdkNavigation;
    } else b.sections[0][1].unshift(["概览", index.key]);
    const seen = new Set();
    for (const [group, rows] of b.sections)
      for (const [label, key, ...more] of rows) {
        const topic = b.byKey.get(key);
        for (const k of [key, ...more]) {
          const a = b.byKey.get(k);
          if (!a || seen.has(k)) throw Error(`Missing or repeated reader entry ${id}/${k}`);
          seen.add(k);
          Object.assign(a, { sectionTitle: group, topicLabel: label, topicKey: key });
          if (k !== "index") b.all.push(a);
        }
        topic.recipes = more;
      }
    if (seen.size !== b.byKey.size)
      throw Error(`Unlisted articles: ${[...b.byKey.keys()].filter((k) => !seen.has(k))}`);
    for (const k of [
      b.start,
      ...b.picks,
      ...Object.values(legacy[id]).flatMap(([k, ids]) => [k, ...Object.values(ids ?? {})]),
    ])
      if (!b.byKey.has(k)) throw Error(`Missing target ${id}/${k}`);
  }
  const emitted = new Set();
  async function page(
    path,
    { book: b, title, article: a, headings = [], kind = "article", eyebrow },
    content,
  ) {
    if (emitted.has(path)) throw Error(`Duplicate output: ${path}`);
    emitted.add(path);
    const href = (target) => esc(posix.relative(posix.dirname(path), target));
    const link = (target, label, attrs = "") =>
      `<a href="${href(target)}"${attrs ? " " + attrs : ""}>${esc(label)}</a>`;
    const entry = (item) => link(item.path, item.title),
      mark = (id, size) =>
        `<img src="${href("media/" + marks[id])}" width="${size}" height="${size}" alt="">`;
    const homeTarget = `../index.html${b ? "?product=" + b.id : ""}`;
    const directory = b
      ? `<nav aria-label="${esc(b.name)}目录" class="chapters">${b.sections.map(([name, rows]) => `<section><h2>${esc(name)}</h2>${rows.map(([label, key]) => link(b.byKey.get(key).path, label, a?.key === key ? 'aria-current="page"' : a?.topicKey === key ? 'aria-current="location"' : "")).join("")}</section>`).join("")}</nav>`
      : "";
    const rail = b
      ? `<aside class="book-nav">${directory}</aside><details class="mobile-nav"><summary>${listIcon} 本册目录 <span>${esc(b.short)}</span></summary>${directory}</details>`
      : "";
    const tools = a
      ? `<button class="copy-page" type="button" hidden>${copyIcon}<span aria-live="polite">复制正文</span></button>`
      : "";
    const turn = (item, rel, name) =>
      item
        ? `<a rel="${rel}" href="${href(item.path)}"><small>${name}</small><span>${esc(item.title)}</span></a>`
        : "";
    const pos = b && a ? b.all.indexOf(a) : -1;
    const pagination =
      pos >= 0
        ? `<nav class="turn" aria-label="章节翻页">${turn(pos ? b.all[pos - 1] : b.byKey.get("index"), "prev", "上一篇")}${turn(b.all[pos + 1], "next", "下一篇")}</nav>`
        : "";
    const toc =
      headings.length > 1
        ? `<nav class="toc" aria-label="本页内容"><b>${listIcon} 在此页面</b>${headings.map((h) => `<a href="#${esc(h.id)}">${esc(h.title)}</a>`).join("")}</nav>`
        : "";
    const result = `<!doctype html><html lang="zh-CN" data-book="${esc(b?.id ?? "library")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc([title, b?.name, "ZPI Docs"].filter(Boolean).join(" · "))}</title><link rel="stylesheet" href="${href("manual.css")}"><script defer src="${href("reader.js")}"></script></head><body><a class="skip" href="#content">跳到正文</a>
<header class="doc-head"><div class="mast"><div class="identity"><a class="brand" href="${href("index.html")}" aria-label="ZPI 使用手册">${mark("zpi", 32)} ZPI Docs</a><span class="language">简体中文</span></div><a class="search-link" aria-label="搜索文档" href="${href("find.html")}${b ? "?book=" + b.id : ""}">${magnifier}<span>搜索文档…</span><kbd>⌘ K</kbd></a><div class="external"><a class="source" href="https://github.com/1316151417/${b?.id === "zpi-quick-chat" ? "zpi-quick-chat" : "zpi"}">GitHub</a>${link(homeTarget, "产品主页", 'class="home-link"')}</div></div>
<nav class="products" aria-label="切换产品手册">${link("index.html", "使用手册", path === "index.html" ? 'aria-current="page"' : "")}${Object.values(
      books,
    )
      .map((x) => link(x.home, x.short, x === b ? 'aria-current="true"' : ""))
      .join("")}</nav></header>
<div class="layout ${b ? "" : "library"}">${rail}<main id="content" class="${kind}"><div class="eyebrow">${esc(eyebrow ?? a?.sectionTitle ?? b?.short ?? "ZPI 使用手册")}</div><div class="title-line"><h1>${esc(title)}</h1>${tools}</div>${content({ link, entry, mark, href })}${pagination}<footer>${link(homeTarget, b ? `返回 ${b.name} 产品介绍` : "返回产品介绍")}${link("versions.html", b ? "适用版本 · " + b.version : "适用版本")}</footer></main>${toc}</div></body></html>\n`;
    const dest = resolve(output, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, result);
  }
  await rm(output, { recursive: true, force: true });
  await page(
    "index.html",
    { title: "产品使用手册", kind: "overview" },
    ({ link, mark }) =>
      `<p class="lead">从手头要做的事开始。</p><div class="bookshelf">${Object.values(books)
        .map(
          (b) =>
            `<section data-volume="${b.id}">${mark(b.id, 44)}<h2>${link(b.home, b.name)}</h2><p>${esc(b.description)}</p>${link(b.byKey.get(b.start).path, b.byKey.get(b.start).title)}</section>`,
        )
        .join("")}</div>`,
  );
  for (const b of Object.values(books)) {
    for (const a of b.byKey.values()) {
      const overview = a.key === "index";
      const { body, headings } = markdown(a.body, a.path);
      await page(
        a.path,
        { book: b, article: a, title: a.title, headings, kind: overview ? "overview" : "article" },
        ({ link, entry }) => {
          const recipes = a.recipes?.length
            ? `<section class="related"><h2>相关实作</h2><ul>${a.recipes.map((k) => `<li>${entry(b.byKey.get(k))}</li>`).join("")}</ul></section>`
            : a.topicKey !== a.key
              ? `<p class="topic-home">所属主题：${link(b.byKey.get(a.topicKey).path, a.topicLabel)}</p>`
              : "";
          const picks =
            overview && b.id !== sdk
              ? `<section class="picks"><h2>按手上的任务查找</h2><ul>${b.picks.map((k) => `<li>${entry(b.byKey.get(k))}</li>`).join("")}</ul></section>`
              : "";
          const routes = overview
            ? `<nav class="routes" aria-label="按类型浏览">${Object.entries(sections)
                .map(([k, l]) => link(`${b.id}/${k}/index.html`, l))
                .join("")}</nav>`
            : "";
          return `<article>${body}</article>${recipes}${picks}${routes}`;
        },
      );
    }
    for (const [type, label] of Object.entries(sections)) {
      const items = b.all.filter(
        (a) =>
          (Object.entries(b.kinds).find(([, groups]) => groups.includes(a.group))?.[0] ?? "how-to") === type,
      );
      await page(
        `${b.id}/${type}/index.html`,
        { book: b, title: label, kind: "index" },
        ({ entry }) => `<ul class="index-list">${items.map((a) => `<li>${entry(a)}</li>`).join("")}</ul>`,
      );
    }
    for (const [old, [target, anchors = {}]] of Object.entries(legacy[b.id])) {
      const dest = b.byKey.get(target);
      await page(
        `${b.id}/${old}.html`,
        { book: b, title: dest.title, kind: "moved" },
        ({ entry }) =>
          `<p>这篇文章已按具体操作重新编排。</p><p>${entry(dest)}</p>${Object.entries(anchors)
            .map(([id, k]) => `<p id="${esc(id)}">${entry(b.byKey.get(k))}</p>`)
            .join("")}`,
      );
    }
  }
  await page("find.html", { title: "查找文档", kind: "index" }, ({ link }) => {
    const item = (path, label, context) =>
      `<li data-terms="${esc((label + " " + context + " " + path).toLowerCase())}">${link(path, label)} <small>${esc(context)}</small></li>`;
    return `<p>按任务或接口名称查找；也可使用浏览器的页内查找。</p><div class="find-controls" hidden><label>关键词<input id="find-input" type="search" placeholder="例如：会话、审批、maxTurns"></label><label>范围<select id="find-book"><option value="">全部手册</option>${Object.values(
      books,
    )
      .map((b) => `<option value="${b.id}">${esc(b.short)}</option>`)
      .join("")}</select></label><p id="find-count" role="status"></p></div>${Object.values(books)
      .map(
        (b) =>
          `<section class="search-results" data-search-book="${b.id}"><h2>${esc(b.name)}</h2><ul>${[...b.byKey.values()].map((a) => item(a.path, a.title, a.sectionTitle + " · " + a.topicLabel)).join("")}${b.id === sdk ? [...Object.keys(functions).map((n) => [n, slug(n)]), ...Object.keys(options).map((n) => ["Options." + n, "options-" + slug(n)]), ...Object.keys(nativeOptions).map((n) => ["zpi." + n, "zpioptions-" + slug(n)]), ...Object.keys(controls).map((n) => [n + "()", "query-" + slug(n)])].map(([n, h]) => item(reference + "#" + h, n, "TypeScript SDK 参考")).join("") : ""}</ul></section>`,
      )
      .join("")}`;
  });
  const versions = markdown(await read("versions.md"));
  await page(
    "versions.html",
    { title: "适用版本", kind: "index" },
    () => `<article>${versions.body}</article>`,
  );
  highlighter.dispose();
  await mkdir(resolve(output, sdk, "examples"), { recursive: true });
  for (const [name, source] of examples) await writeFile(resolve(output, sdk, "examples", name), source);
  await mkdir(resolve(output, "media"), { recursive: true });
  for (const file of ["desktop-deepseek.webp", "quick-draft.webp", ...Object.values(marks)])
    await copyFile(
      file.endsWith(".svg") ? resolve(root, "src", file) : resolve(input, "media", file),
      resolve(output, "media", file),
    );
  for (const name of ["manual.css", "reader.js"]) await copyFile(resolve(input, name), resolve(output, name));
  console.log(
    `Manuals: ${Object.values(books)
      .map((b) => `${b.short} ${b.all.length}`)
      .join(", ")} articles; ${emitted.size} static pages.`,
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildManuals(resolve(process.env.QUICK_CHAT_SOURCE || resolve(root, "../zpi-quick-chat")));
