import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { products, sections } from "../manuals/catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const zpi = resolve(process.env.ZPI_SOURCE || join(root, "../zpi"));
const requireZpi = createRequire(join(zpi, "package.json"));
const { parse } = await import(pathToFileURL(requireZpi.resolve("parse5")).href);
const { chromium } = requireZpi("playwright");
const port = process.env.MANUAL_TEST_PORT || "4181";
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(root, "scripts/serve.cjs")], {
  env: { ...process.env, PORT: port, STATIC_ROOT: join(root, "dist") }, stdio: ["ignore", "pipe", "inherit"],
});
const artifacts = process.env.ARTIFACT_DIR || join(tmpdir(), "zpi-manuals-tests");
const nodes = function* (node) {
  yield node;
  for (const child of node.childNodes || []) yield* nodes(child);
};
const attr = (node, key) => node.attrs?.find((a) => a.name === key)?.value;
const text = (node) => [...nodes(node)].map((child) => child.value || "").join("");
const books = Object.keys(products);
const sources = (await readdir(join(root, "manuals"), { recursive: true })).map((p) => p.split(sep).join("/"));
const articles = sources.filter((p) => p.endsWith(".md") && books.includes(p.split("/")[0]));
const route = (s) => "/manuals/" + s;
const land = (p) => route(`${p}/index.html`);
const pages = ["index.html", "versions.html", ...articles.map((p) => p.replace(/\.md$/, ".html")),
  ...books.flatMap((p) => [`${p}/index.html`, ...Object.keys(sections).map((g) => `${p}/${g}/index.html`)])].map(route);

async function checkStatic() {
  const built = (await readdir(join(root, "dist/manuals"), { recursive: true })).filter((s) => s.endsWith(".html"));
  assert.deepEqual(built.map((p) => route(p.split(sep).join("/"))).sort(), [...pages].sort(), "stale or missing pages");
  const docs = new Map();
  const links = new Map();
  const resources = new Set();
  let blocks = 0, anchors = 0;
  for (const path of pages) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    const elements = [...nodes(parse(await response.text()))];
    const ids = elements.map((e) => attr(e, "id")).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `duplicate ID: ${path}`);
    assert.equal(elements.filter((e) => e.tagName === "h1").length, 1, path);
    assert.equal(elements.some((e) => e.tagName === "script" || e.tagName === "iframe"), false, path);
    docs.set(path, new Set(ids));
    const urls = [];
    for (const e of elements) {
      const raw = attr(e, "href") ?? attr(e, "src");
      if (raw === undefined) continue;
      assert.ok(raw && !raw.startsWith("/"), `not relocatable: ${path} -> ${raw}`);
      const url = new URL(raw, base + path);
      if (url.origin !== base) continue;
      assert.ok(!url.pathname.endsWith(".md"), `leaks source path: ${url}`);
      if (e.tagName === "a") { urls.push(url); anchors++; }
      else resources.add(url.pathname);
    }
    links.set(path, urls);
    const article = elements.find((e) => e.tagName === "article");
    if (!article) continue;
    const source = await readFile(join(root, path.slice(1).replace(/\.html$/, ".md")), "utf8");
    const snippets = [...source.matchAll(/^```[^\n]*\n([\s\S]*?)^```$/gm)].map((m) => m[1].trimEnd());
    const displayed = [...nodes(article)].filter((e) => e.tagName === "pre").map((e) => text(e).trimEnd());
    assert.deepEqual(displayed, snippets, `code changed during rendering: ${path}`);
    blocks += displayed.length;
  }
  for (const [from, urls] of links) for (const url of urls) {
    if (!docs.has(url.pathname)) {
      assert.ok(!url.pathname.startsWith("/manuals/"), `${from} -> ${url}`);
      resources.add(url.pathname);
    } else if (url.hash) {
      assert.ok(docs.get(url.pathname).has(decodeURIComponent(url.hash.slice(1))), `${from} -> ${url}`);
    }
  }
  for (const path of resources) assert.equal((await fetch(base + path, { method: "HEAD" })).status, 200, path);
  const reachable = new Set();
  function visit(path) {
    if (reachable.has(path) || !links.has(path)) return;
    reachable.add(path);
    for (const url of links.get(path)) visit(url.pathname);
  }
  visit(route("index.html"));
  assert.equal(reachable.size, pages.length, "unreachable pages");
  console.log(`${pages.length} static pages (${articles.length} articles); ${anchors} internal links including fragments; ${blocks} fenced examples match source.`);
}

const lookups = [
  ["zpi", "how-to/review", "last-turn", ["上一轮更改", "不要求目录是 Git 仓库"]],
  ["zpi-quick-chat", "how-to/capture", "selection", ["Option+Shift+C", "只追加草稿", "辅助功能"]],
  ["zpi-agent-sdk", "reference/results", "decision", ["success", "errors", "try/catch"]],
];
async function checkNavigation(page) {
  for (const [book, task, fragment, clues] of lookups) {
    await page.goto(base + `/?product=${book}`);
    await page.locator(`html[data-product='${book}']`).waitFor();
    const manual = page.locator(".mast-actions #manual-link");
    assert.equal(await manual.innerText(), "使用手册");
    assert.equal(await manual.evaluate((a) => a.nextElementSibling.id), "source-link");
    assert.equal(await manual.evaluate((a) => new URL(a.href).pathname), land(book));
    const linkRect = await manual.boundingBox(), repoRect = await page.locator("#source-link").boundingBox();
    assert.ok(linkRect.x + linkRect.width <= repoRect.x + 1, "manual before GitHub without overlap");
    await manual.click();
    assert.equal(new URL(page.url()).pathname, land(book));
    assert.equal(await page.locator(".routes a").count(), 4);
    const target = route(`${book}/${task}.html`);
    await page.locator(`main a[href="${task}.html"]`).click();
    assert.equal(new URL(page.url()).pathname, target);
    for (const clue of clues) assert.ok((await page.locator("article").innerText()).includes(clue), `${task}: ${clue}`);
    await page.reload();
    assert.equal(await page.locator("article").count(), 1);
    await page.goBack();
    assert.equal(new URL(page.url()).pathname, land(book));
    await page.goForward();
    assert.equal(new URL(page.url()).pathname, target);
    await page.goto(base + target + "#" + fragment);
    await page.reload();
    assert.equal(await page.locator(":target").getAttribute("id"), fragment);
    await page.locator("footer > a").click();
    assert.equal(new URL(page.url()).searchParams.get("product"), book);
  }
  await page.goto(base + "/");
  await page.locator("a[data-product='zpi-quick-chat']").click();
  await page.locator("a[data-product='zpi-agent-sdk']").click();
  await page.goBack();
  await page.locator("html[data-product='zpi-quick-chat']").waitFor();
  assert.equal(await page.locator("#manual-link").getAttribute("href"), "." + land("zpi-quick-chat"));
  await page.goForward();
  await page.locator("html[data-product='zpi-agent-sdk']").waitFor();
  assert.equal(await page.locator("#manual-link").getAttribute("href"), "." + land("zpi-agent-sdk"));
}

let browser;
try {
  await new Promise((ready, fail) => {
    server.stdout.once("data", ready);
    server.once("error", fail);
    server.once("exit", (code) => fail(Error(`Static server exited with ${code}`)));
  });
  await checkStatic();
  await mkdir(artifacts, { recursive: true });
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1300, height: 850 }, reducedMotion: "reduce" });
  await checkNavigation(page);
  for (const width of [581, 640, 768, 801, 820]) {
    await page.setViewportSize({ width, height: 850 });
    assert.ok(await page.evaluate(() => {
      const manual = document.getElementById("manual-link").getBoundingClientRect();
      const nav = document.querySelector(".products").getBoundingClientRect();
      const header = document.querySelector(".mast").getBoundingClientRect();
      return manual.height < 32 && (manual.left >= nav.right - 1 || manual.bottom <= nav.top) &&
        document.querySelector(".mast-actions").getBoundingClientRect().right <= header.right + 1;
    }), `title bar links at ${width}px`);
  }
  await page.setViewportSize({ width: 1300, height: 850 });
  await page.goto(base + route("zpi-agent-sdk/reference/results.html"));
  await page.screenshot({ path: join(artifacts, "result-reference.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await checkNavigation(page);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of pages) {
    await page.goto(base + path);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `mobile overflow: ${path}`);
  }
  await page.goto(base + route("zpi-agent-sdk/tutorial/first-query.html"));
  const code = page.locator("pre code.language-ts");
  assert.equal(await code.evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    // Chromium omits the final line break before </code>, but must preserve every interior character.
    const copied = getSelection().toString();
    return copied === node.textContent || copied + "\n" === node.textContent;
  }), true, "TypeScript code is selectable with original newlines");
  await page.goto(base + land("zpi-quick-chat"));
  await page.screenshot({ path: join(artifacts, "quick-book-mobile.png") });
  console.log(`Three lookup paths passed on desktop and mobile; direct URLs, reload, back/forward, deep links, 320px overflow and code selection OK. Screenshots: ${artifacts}`);
} finally {
  await browser?.close();
  server.kill();
}
