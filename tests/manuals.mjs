import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parsePart, products, sections } from "../manuals/catalog.mjs";
import { legacy } from "../manuals/legacy.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  zpi = resolve(process.env.ZPI_SOURCE || join(root, "../zpi"));
const requireZpi = createRequire(join(zpi, "package.json")),
  { parse } = await import(pathToFileURL(requireZpi.resolve("parse5")).href),
  { chromium } = requireZpi("playwright");
const port = process.env.MANUAL_TEST_PORT || "4181",
  base = `http://127.0.0.1:${port}`,
  output = process.env.ARTIFACT_DIR || join(tmpdir(), "zpi-manuals-tests");
const route = (s) => `/manuals/${s}`,
  home = (id) => route(`${id}/index.html`);
const manuscripts = new Map(),
  counts = {},
  pages = new Set([route("index.html"), route("versions.html")]),
  archived = new Set();
for (const [id, b] of Object.entries(products)) {
  let n = 0,
    groups = 0;
  for (const [, file] of b.parts)
    for (const g of parsePart(await readFile(join(root, "manuals", id, file + ".md"), "utf8"))) {
      groups++;
      for (const a of g.articles) {
        const url = route(`${id}/${g.id}/${a.id}.html`);
        assert.ok(!manuscripts.has(url));
        manuscripts.set(url, a.body);
        pages.add(url);
        n++;
      }
    }
  counts[id] = [groups, n];
  pages.add(home(id));
  manuscripts.set(home(id), await readFile(join(root, "manuals", id, "overview.md"), "utf8"));
  for (const k of Object.keys(sections)) pages.add(route(`${id}/${k}/index.html`));
  for (const k of Object.keys(legacy[id])) {
    const url = route(`${id}/${k}.html`);
    pages.add(url);
    archived.add(url);
  }
}
assert.deepEqual(counts, { zpi: [30, 153], "zpi-quick-chat": [6, 25], "zpi-agent-sdk": [18, 76] });
const server = spawn(process.execPath, [join(root, "scripts/serve.cjs")], {
  env: { ...process.env, PORT: port, STATIC_ROOT: join(root, "dist") },
  stdio: ["ignore", "pipe", "inherit"],
});
function* walk(node) {
  yield node;
  for (const c of node.childNodes || []) yield* walk(c);
}
const attr = (node, k) => node.attrs?.find((a) => a.name === k)?.value,
  text = (n) => [...walk(n)].map((ch) => ch.value || "").join("");
async function staticCheck() {
  const built = (await readdir(join(root, "dist", "manuals"), { recursive: true }))
    .filter((s) => s.endsWith(".html"))
    .map((p) => route(p.split(sep).join("/")));
  assert.deepEqual(built.sort(), [...pages].sort());
  const docs = new Map(),
    edges = new Map(),
    resources = new Set();
  let links = 0,
    blocks = 0;
  for (const path of pages) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    const nodes = [...walk(parse(await r.text()))];
    assert.equal(nodes.filter((n) => n.tagName === "h1").length, 1, path);
    assert.ok(!nodes.some((n) => ["script", "iframe"].includes(n.tagName)), path);
    const ids = nodes.map((n) => attr(n, "id")).filter(Boolean);
    assert.equal(ids.length, new Set(ids).size, path);
    docs.set(path, new Set(ids));
    const hrefs = new Set();
    for (const n of nodes) {
      const raw = attr(n, "href") ?? attr(n, "src");
      if (raw == null) continue;
      assert.ok(raw && !raw.startsWith("/"), `non-relative: ${path} ${raw}`);
      const u = new URL(raw, base + path);
      if (u.origin !== base) continue;
      assert.ok(!u.pathname.endsWith(".md"));
      if (n.tagName === "a" && attr(n, "download") !== undefined) {
        const file = attr(n, "download");
        assert.match(file, /^[-a-z0-9]+\.mts$/);
        assert.equal(u.pathname, route("zpi-agent-sdk/examples/" + file));
        const snippet = [...manuscripts.get(path).matchAll(/^```ts ([-\w]+\.mts)\n([\s\S]*?)^```$/gm)].find(
          (m) => m[1] === file,
        );
        assert.ok(snippet, file);
        const source = await fetch(u);
        assert.equal(source.status, 200);
        assert.equal(await source.text(), snippet[2]);
      } else if (n.tagName === "a") {
        hrefs.add(u.pathname + u.hash);
        links++;
      } else resources.add(u.pathname);
    }
    edges.set(path, hrefs);
    if (manuscripts.has(path)) {
      const content = nodes.find((n) => n.tagName === "article");
      assert.ok(content, path);
      const snippets = [...manuscripts.get(path).matchAll(/^```[^\n]*\n([\s\S]*?)^```$/gm)].map((m) =>
        m[1].trimEnd(),
      );
      assert.deepEqual(
        [...walk(content)].filter((n) => n.tagName === "pre").map((n) => text(n).trimEnd()),
        snippets,
        path,
      );
      blocks += snippets.length;
    }
  }
  for (const [from, urls] of edges)
    for (const url of urls) {
      const [path, hash] = url.split("#");
      if (path.startsWith("/manuals/")) {
        assert.ok(docs.has(path), `${from}: ${url}`);
        if (hash) assert.ok(docs.get(path).has(decodeURIComponent(hash)), url);
      } else resources.add(path);
    }
  const visited = new Set();
  function visit(path) {
    if (visited.has(path) || !edges.has(path)) return;
    visited.add(path);
    for (const dest of edges.get(path)) visit(dest.split("#")[0]);
  }
  visit(route("index.html"));
  for (const path of pages) if (!archived.has(path)) assert.ok(visited.has(path), `unreachable: ${path}`);
  let bookmarks = 0;
  for (const [id, spec] of Object.entries(legacy))
    for (const [key, [to, anchors = {}]] of Object.entries(spec)) {
      const path = route(`${id}/${key}.html`);
      assert.ok(edges.get(path).has(route(`${id}/${to}.html`)));
      for (const [hash, dest] of Object.entries(anchors)) {
        assert.ok(docs.get(path).has(hash));
        assert.ok(edges.get(path).has(route(`${id}/${dest}.html`)));
        bookmarks++;
      }
    }
  for (const path of resources)
    assert.equal((await fetch(base + path, { method: "HEAD" })).status, 200, path);
  assert.equal((await fetch(base + "/backup/zpi/README.md")).status, 404, "retired public files");
  console.log(
    `${pages.size} static pages; ${links} internal links; ${blocks} original code fences; ${archived.size} legacy routes and ${bookmarks} bookmarks.`,
  );
}
const lookups = [
  ["zpi", "审查文件改动", "review/last-turn", "不要求目录是 Git 仓库"],
  ["zpi-quick-chat", "把眼前的内容带进来", "capture/selection", "Option+Shift+C"],
  ["zpi-agent-sdk", "把回答交给应用", "output/stream", "includePartialMessages"],
];
async function navigate(page, mobile) {
  for (const [book, group, task, clue] of lookups) {
    await page.goto(base + home(book));
    const nav = page.locator(mobile ? ".mobile-nav" : ".book-nav");
    if (mobile) await nav.locator(":scope > summary").click();
    const part = nav.locator("details.part").filter({ has: page.getByText(group, { exact: true }) });
    if ((await part.count()) && (await part.getAttribute("open")) === null)
      await part.locator(":scope > summary").click();
    await nav.getByText(group, { exact: true }).click();
    const link = nav.locator(`a[href="${task}.html"]`);
    assert.ok(await link.isVisible());
    await link.click();
    assert.equal(new URL(page.url()).pathname, route(`${book}/${task}.html`));
    assert.ok((await page.locator("article").innerText()).includes(clue));
    await page.reload();
    await page.goBack();
    assert.equal(new URL(page.url()).pathname, home(book));
    await page.goForward();
    assert.ok(await page.locator(".turn [rel=next]").isVisible());
    await page.getByRole("link", { name: /^返回 .* 产品介绍$/ }).click();
    assert.equal(new URL(page.url()).searchParams.get("product"), book);
  }
}
async function checkDisclosures(page) {
  await page.goto(base + route("zpi/start/trust.html"));
  const part = page
    .locator(".book-nav .part")
    .filter({ has: page.getByText("在任务里工作", { exact: true }) });
  const summary = part.locator(":scope > summary");
  const state = () =>
    summary.evaluate((el) => ({
      open: el.parentElement.open,
      mark: getComputedStyle(el, "::after").maskImage,
      direction: getComputedStyle(el, "::after").transform,
      focus: document.activeElement === el,
    }));
  const closed = await state();
  assert.equal(closed.open, false);
  assert.notEqual(closed.mark, "none");
  await summary.focus();
  await summary.press("Enter");
  assert.deepEqual(await state(), {
    ...closed,
    open: true,
    focus: true,
    direction: "matrix(0, 1, -1, 0, 0, 0)",
  });
  const child = part.locator(".nav-group summary").first();
  await child.focus();
  await child.press("Space");
  assert.ok(await part.locator(".nav-group a").first().isVisible());
  await summary.focus();
  await summary.press("Space");
  assert.ok(!(await part.locator(".nav-group a").first().isVisible()));
  assert.ok(await page.locator('.book-nav [aria-current="page"]').isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = page.locator(".mobile-nav > summary");
  await phone.focus();
  await phone.press("Enter");
  assert.ok(await page.locator('.mobile-nav [aria-current="page"]').isVisible());
  assert.ok((await phone.boundingBox()).height >= 44);
  await phone.press("Space");
  assert.equal(await page.locator(".mobile-nav").getAttribute("open"), null);
}
let browser;
try {
  await new Promise((ready, fail) => {
    server.stdout.once("data", ready);
    server.once("error", fail);
    server.once("exit", (code) => fail(Error("Server exited: " + code)));
  });
  await staticCheck();
  await mkdir(output, { recursive: true });
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  const nojs = await browser.newContext({
      javaScriptEnabled: false,
      reducedMotion: "reduce",
      viewport: { width: 1380, height: 920 },
      colorScheme: "light",
    }),
    page = await nojs.newPage();
  await checkDisclosures(page);
  await page.setViewportSize({ width: 1380, height: 920 });
  await navigate(page, false);
  await page.goto(base + route("zpi/start/first-model.html"));
  await page.screenshot({ path: join(output, "desktop-first-model.png") });
  for (const [book, old, hash, dest] of [
    ["zpi", "how-to/review", "last-turn", "review/last-turn"],
    ["zpi-quick-chat", "how-to/capture", "clipboard", "capture/clipboard"],
    ["zpi-agent-sdk", "reference/results", "decision", "output/final"],
  ]) {
    await page.goto(base + route(`${book}/${old}.html#${hash}`));
    await page.locator(":target a").click();
    assert.equal(new URL(page.url()).pathname, route(`${book}/${dest}.html`));
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await navigate(page, true);
  await page.goto(base + home("zpi-quick-chat"));
  await page.screenshot({ path: join(output, "quick-book-mobile.png") });
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of pages) {
    await page.goto(base + path);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path);
  }
  await page.goto(base + route("zpi-agent-sdk/start/first.html"));
  assert.ok(
    await page.locator("pre code.language-ts").evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      return s.toString().trimEnd() === el.textContent.trimEnd();
    }),
  );
  const dark = await browser.newPage({ viewport: { width: 1280, height: 880 }, colorScheme: "dark" });
  await dark.goto(base + route("zpi-agent-sdk/output/stream.html"));
  await dark.screenshot({ path: join(output, "sdk-stream-dark.png") });
  for (const [id] of Object.entries(products)) {
    await dark.goto(base + "/?product=" + id);
    await dark.locator(`html[data-product="${id}"]`).waitFor();
    const l = dark.locator("#manual-link");
    assert.equal(await l.innerText(), "使用手册");
    assert.equal(await l.evaluate((el) => new URL(el.href).pathname), home(id));
  }
  console.log(
    "No-JS desktop/mobile directory navigation, reload/history, legacy fragments, product returns, 320px overflow and code selection passed. Screenshots: " +
      output,
  );
} finally {
  await browser?.close();
  server.kill();
}
