import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { products, sections } from "../manuals/catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "manuals");
const output = resolve(root, "public/manuals");
const escape = (value) => String(value).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function loadArticles(Marked, Renderer) {
  const articles = [];
  for (const product of Object.keys(products)) {
    for (const group of Object.keys(sections)) {
      const dir = resolve(input, product, group);
      for (const file of (await readdir(dir)).filter((f) => f.endsWith(".md")).sort()) {
        if (!/^[a-z][a-z0-9-]*\.md$/.test(file)) throw Error(`Invalid manual slug: ${file}`);
        const key = `${group}/${file.slice(0, -3)}`;
        const path = `${product}/${key}.html`;
        const source = (await readFile(resolve(dir, file), "utf8")).trim();
        const match = /^# ([^\n]+)\n+([\s\S]+)$/.exec(source);
        if (!match) throw Error(`Missing manual title or body: ${path}`);
        const headings = [];
        const ids = new Set();
        const renderer = new Renderer();
        renderer.heading = function ({ depth, text }) {
          const [, name, explicit] = /^(.*?)(?:\s+\{#([a-z][\w-]*)\})?$/.exec(text);
          const id = explicit ?? name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase();
          if (!id || ids.has(id)) throw Error(`Ambiguous heading in ${path}: ${name}`);
          ids.add(id);
          if (depth === 2) headings.push({ id, name });
          return `<h${depth} id="${escape(id)}">${escape(name)}</h${depth}>\n`;
        };
        renderer.link = function (token) {
          return Renderer.prototype.link.call(this, { ...token, href: token.href.replace(/\.md(?=#|$)/, ".html") });
        };
        const html = new Marked({ renderer, gfm: true }).parse(match[2]);
        articles.push({ product, group, key, path, title: match[1], html, headings });
      }
    }
  }
  return articles;
}

export async function buildManuals(quick) {
  const requireQuick = createRequire(resolve(quick, "package.json"));
  const { Marked, Renderer } = await import(pathToFileURL(requireQuick.resolve("marked")).href);
  const articles = await loadArticles(Marked, Renderer);
  const byProduct = (product, group) => articles.filter((a) => a.product === product && (!group || a.group === group));
  const picks = (product) => products[product].picks.map((key) => {
    const found = articles.find((a) => a.product === product && a.key === key);
    if (!found) throw Error(`Missing featured task: ${product}/${key}`);
    return found;
  });
  const list = (items, link) => `<ul class="links">${items.map((a) => `<li>${link(a.path, a.title)}</li>`).join("")}</ul>`;

  async function page({ path, title, product, group, headings = [] }, content) {
    const book = products[product];
    const home = `${product}/index.html`;
    // Relative hyperlinks also work on static hosts mounted under a project prefix.
    const href = (target) => escape(posix.relative(posix.dirname(path), target));
    const link = (target, label, current = false) =>
      `<a href="${href(target)}"${current ? ' aria-current="page"' : ""}>${escape(label)}</a>`;
    const nav = Object.entries(products).map(([key, p]) => link(`${key}/index.html`, p.name, path === `${key}/index.html`)).join("");
    const crumb = [link("index.html", "文档中心")];
    if (book) crumb.push(link(home, book.name));
    if (group) crumb.push(link(`${product}/${group}/index.html`, sections[group][0]));
    const sidebar = book ? `<aside id="book-nav"><nav aria-label="本册目录">
      <a class="book" href="${href(home)}">${escape(book.name)} 手册</a>
      ${Object.entries(sections).map(([key, [label]]) => `<details${key === group ? " open" : ""}>
        <summary>${label}</summary>${link(`${product}/${key}/index.html`, `${label}索引`)}
        ${byProduct(product, key).map((a) => link(a.path, a.title, a.path === path)).join("")}</details>`).join("")}
    </nav></aside>` : "";
    const contents = headings.length > 1 ? `<details class="contents"><summary>本页内容</summary>
      ${headings.map((h) => `<a href="#${escape(h.id)}">${escape(h.name)}</a>`).join("")}</details>` : "";
    const back = link(`../index.html${book ? `?product=${product}` : ""}`, book ? `返回 ${book.name} 产品介绍` : "返回产品介绍");
    const titleText = [title, ...(book && path !== home ? [book.name] : []), "ZPI 文档中心"].join(" · ");
    const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(titleText)}</title><link rel="stylesheet" href="${href("manual.css")}"></head>
<body${book ? ` data-product="${product}"` : ""}><a class="skip" href="#content">跳到正文</a>
<header><div class="mast"><a class="brand" href="${href("index.html")}">ZPI <span>使用手册</span></a><nav aria-label="切换产品手册">${nav}</nav></div></header>
<div class="layout${book ? "" : " hub"}">${sidebar}<main id="content">
<nav class="crumb" aria-label="所在位置">${crumb.join(" / ")}</nav>
<h1>${escape(title)}</h1>${contents}${content(link)}
<footer>${back}<span>${escape(book?.baseline ?? "桌面 · 浮窗 · 开发者接口")} · ${link("versions.html", "核对范围")}</span></footer>
</main></div></body></html>\n`;
    const dest = resolve(output, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, html);
  }

  // Vite copies public/ wholesale: a removed article must not survive the next build.
  await rm(output, { recursive: true, force: true });
  await page({ path: "index.html", title: "使用手册" }, (link) => `
    <p class="lead">打开的是桌面工作区、悬浮对话窗，还是一段 TypeScript？从你面前的产品开始。</p>
    ${Object.entries(products).map(([id, p]) => `<section><h2>${link(`${id}/index.html`, p.name)}</h2>
      <p>${escape(p.description)}</p>${list(picks(id), link)}</section>`).join("")}`);
  for (const [product, p] of Object.entries(products)) {
    await page({ path: `${product}/index.html`, product, title: `${p.name} 使用手册` }, (link) => `
      <p class="lead">${escape(p.description)}</p>
      <nav class="routes" aria-label="四种阅读入口">${Object.entries(sections).map(([key, [type, intent, desc]]) => `<section>
        <h2>${link(`${product}/${key}/index.html`, `${type}｜${intent}`)}</h2><p>${desc}</p></section>`).join("")}</nav>
      <section><h2>常用查找</h2>${list(picks(product), link)}</section>`);
    for (const [group, [type, intent, desc]] of Object.entries(sections)) {
      const items = byProduct(product, group);
      if (!items.length) throw Error(`Empty manual section: ${product}/${group}`);
      await page({ path: `${product}/${group}/index.html`, product, group, title: `${type}｜${intent}` },
        (link) => `<p class="lead">${desc}</p>${list(items, link)}`);
    }
  }
  for (const a of articles) await page(a, () => `<article>${a.html}</article>`);
  const versions = await readFile(resolve(input, "versions.md"), "utf8");
  await page({ path: "versions.html", title: "版本与验证边界" }, () => new Marked().parse(versions));
  await copyFile(resolve(input, "manual.css"), resolve(output, "manual.css"));
  console.log(`Manuals: ${articles.length} articles, ${Object.keys(products).length} books, ${Object.keys(sections).length} sections each.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildManuals(resolve(process.env.QUICK_CHAT_SOURCE || resolve(root, "../zpi-quick-chat")));
}
