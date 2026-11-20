import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parsePart, products, sections } from "../manuals/catalog.mjs";
import { legacy } from "../manuals/legacy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "manuals"),
  output = resolve(root, "public/manuals");
const esc = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const read = (file) => readFile(resolve(input, file), "utf8");
const marks = { zpi: "zpi-app.webp", "zpi-quick-chat": "quick-chat.svg", "zpi-agent-sdk": "agent-sdk.svg" };

export async function buildManuals(quick, zpi = resolve(process.env.ZPI_SOURCE || resolve(root, "../zpi"))) {
  const { createHighlighter } = await import(
    pathToFileURL(createRequire(resolve(zpi, "package.json")).resolve("shiki")).href
  );
  const highlighter = await createHighlighter({
    themes: ["github-dark"],
    langs: ["typescript", "bash", "markdown"],
  });
  const languages = {
    ts: ["typescript", "TypeScript"],
    sh: ["bash", "Shell"],
    zsh: ["bash", "zsh"],
    md: ["markdown", "Markdown"],
  };
  const { Marked, Renderer } = await import(
    pathToFileURL(createRequire(resolve(quick, "package.json")).resolve("marked")).href
  );
  const examples = new Map();
  function markdown(source, pagePath) {
    const headings = [],
      renderer = new Renderer();
    renderer.code = function ({ text, lang: info }) {
      const [lang, file] = (info ?? "").split(/\s+/);
      let download = "";
      if (file) {
        if (
          lang !== "ts" ||
          !/^zpi-agent-sdk\//.test(pagePath ?? "") ||
          !/^[-a-z0-9]+\.mts$/.test(file) ||
          examples.has(file)
        )
          throw Error(`Invalid or duplicate example: ${file}`);
        examples.set(file, text + "\n");
        const target = posix.relative(posix.dirname(pagePath), "zpi-agent-sdk/examples/" + file);
        download = `<a href="${esc(target)}" download="${esc(file)}">下载 ${esc(file)}</a>`;
      }
      const [grammar, label] = languages[lang] ?? [undefined, lang || "文本"];
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
      const id = text
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      if (!id || headings.some((h) => h.id === id)) throw Error(`Duplicate or empty heading: ${text}`);
      headings.push({ id, title: text });
      return `<h${Math.max(2, depth - 1)} id="${esc(id)}">${esc(text)}</h${Math.max(2, depth - 1)}>\n`;
    };
    return { body: new Marked({ renderer, gfm: true }).parse(source), headings };
  }
  const books = {};
  for (const [id, spec] of Object.entries(products)) {
    const files = await readdir(resolve(input, id));
    const expected = ["overview.md", ...spec.parts.map(([, name]) => name + ".md")].sort();
    if (files.sort().join() !== expected.join()) throw Error(`Unlisted manuscript in ${id}: ${files}`);
    const b = (books[id] = { ...spec, id, parts: [], all: [], byKey: new Map(), groups: new Set() });
    for (const [title, name] of spec.parts) {
      const groups = parsePart(await read(`${id}/${name}.md`));
      if (!groups.length) throw Error(`Empty manuscript ${name}`);
      b.parts.push({ title, groups });
      for (const g of groups) {
        if (b.groups.has(g.id)) throw Error(`Duplicate group: ${id}/${g.id}`);
        b.groups.add(g.id);
        for (const a of g.articles) {
          const key = g.id + "/" + a.id;
          if (b.byKey.has(key) || legacy[id][key]) throw Error(`Duplicate URL: ${id}/${key}`);
          Object.assign(a, { key, path: `${id}/${key}.html`, group: g.id, groupTitle: g.title, part: title });
          b.byKey.set(key, a);
          b.all.push(a);
        }
      }
    }
    for (const key of [
      b.start,
      ...b.picks,
      ...Object.values(legacy[id]).flatMap(([key, anchors]) => [key, ...Object.values(anchors ?? {})]),
    ])
      if (!b.byKey.has(key)) throw Error(`Unknown manual target ${id}/${key}`);
  }
  const emitted = new Set();
  async function page(path, { book: b, title, article: a, headings = [], kind = "article" }, content) {
    if (emitted.has(path)) throw Error(`Duplicate output ${path}`);
    emitted.add(path);
    const href = (target) => esc(posix.relative(posix.dirname(path), target));
    function link(target, label, attrs = "") {
      return `<a href="${href(target)}"${attrs ? " " + attrs : ""}>${esc(label)}</a>`;
    }
    const bookLink = (x, label) =>
      link(
        `${x.id}/index.html`,
        label,
        x === b ? 'aria-current="' + (kind === "overview" ? "page" : "true") + '"' : "",
      );
    const entry = (item, attrs = "") => link(item.path, item.title, attrs);
    const mark = (id, size) =>
      `<img src="${href(`media/${marks[id]}`)}" width="${size}" height="${size}" alt="">`;
    const home = b && `${b.id}/index.html`;
    const directoryGroup = (g) =>
      `<details class="nav-group"${g.id === (a?.group ?? "start") ? " open" : ""}><summary>${esc(g.title)}</summary><div>${g.articles.map((s) => entry(s, s === a ? 'aria-current="page"' : "")).join("")}</div></details>`;
    const directoryPart = (part, index) => {
      const groups = part.groups.map(directoryGroup).join("");
      if (b.parts.length === 1) return groups;
      const expanded = a ? a.part === part.title : index === 0;
      return `<details class="part"${expanded ? " open" : ""}><summary>${esc(part.title)}</summary>${groups}</details>`;
    };
    const groupNav = b
      ? `<nav aria-label="${b.name}目录" class="chapters">${link(home, "手册概述", kind === "overview" ? 'aria-current="page"' : "")}${b.parts.map(directoryPart).join("")}</nav>`
      : "";
    const directory = b
      ? `<aside class="book-nav"><div class="book-label">${esc(b.name)} <small>v${esc(b.version)}</small></div>${groupNav}</aside><details class="mobile-nav"><summary>本册目录<span>${esc(b.short)}</span></summary>${groupNav}</details>`
      : "";
    const position = a ? b.all.indexOf(a) : -1;
    const turn = (item, rel, name) =>
      item
        ? `<a rel="${rel}" href="${href(item.path)}"><small>${name}</small><span>${esc(item.title)}</span></a>`
        : "";
    const pagination = a
      ? `<nav class="turn" aria-label="章节翻页">${turn(b.all[position - 1], "prev", "上一篇")}${turn(b.all[position + 1], "next", "下一篇")}</nav>`
      : "";
    const trail = [
      link("index.html", "使用手册"),
      ...(b ? [link(home, b.short)] : []),
      ...(a ? [esc(a.groupTitle)] : []),
    ].join('<i aria-hidden="true">/</i>');
    const toc =
      headings.length > 1
        ? `<nav class="toc" aria-label="本页内容"><b>本页内容</b>${headings.map((h) => `<a href="#${esc(h.id)}">${esc(h.title)}</a>`).join("")}</nav>`
        : "";
    const result = `<!doctype html><html lang="zh-CN" data-book="${esc(b?.id ?? "library")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc([title, b?.name, "ZPI 使用手册"].filter(Boolean).join(" · "))}</title><link rel="stylesheet" href="${href("manual.css")}"></head><body><a class="skip" href="#content">跳到正文</a>
<header><div class="mast"><a class="brand" href="${href("index.html")}" aria-label="ZPI 使用手册">${mark("zpi", 32)}<span>使用手册</span></a><nav aria-label="切换产品手册">${Object.values(
      books,
    )
      .map((x) => bookLink(x, x.short))
      .join("")}</nav></div></header>
<div class="layout ${b ? "" : "library"}">${directory}<main id="content" class="${kind}"><nav class="crumb" aria-label="所在位置">${trail}</nav><h1>${esc(title)}</h1>${content({ link, entry, href, mark })}${pagination}<footer>${link(`../index.html${b ? "?product=" + b.id : ""}`, b ? `返回 ${b.name} 产品介绍` : "返回产品介绍")}${link("versions.html", "适用版本")}</footer></main>${toc}</div></body></html>\n`;
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
            `<section data-volume="${b.id}">${mark(b.id, 44)}<h2>${link(`${b.id}/index.html`, b.name)}</h2><p>${esc(b.description)}</p>${link(b.byKey.get(b.start).path, b.byKey.get(b.start).title)}</section>`,
        )
        .join("")}</div>`,
  );
  for (const b of Object.values(books)) {
    const overview = markdown(await read(b.id + "/overview.md"));
    await page(
      `${b.id}/index.html`,
      { book: b, title: b.name + " 使用手册", kind: "overview" },
      ({ link, entry }) =>
        `<article>${overview.body}</article><section class="picks"><h2>按手上的任务查找</h2><ul>${b.picks.map((k) => `<li>${entry(b.byKey.get(k))}</li>`).join("")}</ul></section><nav class="routes" aria-label="按类型浏览">${Object.entries(
          sections,
        )
          .map(([key, label]) => link(`${b.id}/${key}/index.html`, label))
          .join("")}</nav>`,
    );
    for (const a of b.all) {
      const { body, headings } = markdown(a.body, a.path);
      await page(
        a.path,
        { book: b, article: a, title: a.title, headings },
        () => `<article>${body}</article>`,
      );
    }
    for (const [type, label] of Object.entries(sections)) {
      const entries = b.all.filter(
        (a) =>
          (Object.entries(b.kinds).find(([, groups]) => groups.includes(a.group))?.[0] ?? "how-to") === type,
      );
      await page(
        `${b.id}/${type}/index.html`,
        { book: b, title: label, kind: "index" },
        ({ entry }) => `<ul class="index-list">${entries.map((a) => `<li>${entry(a)}</li>`).join("")}</ul>`,
      );
    }
    for (const [old, [target, anchors = {}]] of Object.entries(legacy[b.id])) {
      const dest = b.byKey.get(target);
      await page(
        `${b.id}/${old}.html`,
        { book: b, title: dest.title, kind: "moved" },
        ({ entry }) =>
          `<p>这篇文章已按具体操作重新编排。</p><p class="continue">${entry(dest)}</p>${Object.entries(
            anchors,
          )
            .map(([id, key]) => `<p id="${esc(id)}">${entry(b.byKey.get(key))}</p>`)
            .join("")}`,
      );
    }
  }
  const versions = markdown(await read("versions.md"));
  await page(
    "versions.html",
    { title: "适用版本", kind: "index" },
    () => `<article>${versions.body}</article>`,
  );
  highlighter.dispose();
  await mkdir(resolve(output, "zpi-agent-sdk/examples"), { recursive: true });
  for (const [name, source] of examples)
    await writeFile(resolve(output, "zpi-agent-sdk/examples", name), source);
  await mkdir(resolve(output, "media"), { recursive: true });
  for (const file of ["desktop-deepseek.webp", "quick-draft.webp", ...Object.values(marks)]) {
    const source = file.endsWith(".svg") ? resolve(root, "src", file) : resolve(input, "media", file);
    await copyFile(source, resolve(output, "media", file));
  }
  await copyFile(resolve(input, "manual.css"), resolve(output, "manual.css"));
  console.log(
    `Manuals: ${Object.values(books)
      .map((b) => `${b.short} ${b.all.length}`)
      .join(", ")} articles; ${emitted.size} static pages.`,
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildManuals(resolve(process.env.QUICK_CHAT_SOURCE || resolve(root, "../zpi-quick-chat")));
