import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkTheme } from "./theme.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(
  resolve(process.env.ZPI_SOURCE || resolve(root, "../zpi"), "package.json"),
)("playwright");
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
async function exercise(home, mount) {
  const origin = new URL(home).origin,
    at = (s) => new URL(s, home).href;
  if (mount) {
    const r = await fetch(origin + "/zpi?product=zpi-agent-sdk", { redirect: "manual" });
    assert.equal(r.status, 308);
    assert.equal(r.headers.get("location"), "/zpi/?product=zpi-agent-sdk");
    assert.equal((await fetch(origin + "/index.html")).status, 404);
  }
  const c = await browser.newContext({ reducedMotion: "reduce", colorScheme: "dark" }),
    bad = [];
  try {
    await c.route(/^https?:/, (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== origin || !u.pathname.startsWith(mount + "/")) {
        bad.push(u.href);
        return r.abort();
      }
      return r.continue();
    });
    c.on("response", (r) => {
      if (r.status() >= 400) bad.push(r.status() + " " + r.url());
    });
    const p = await c.newPage();
    p.setDefaultTimeout(16000);
    await checkTheme(p, home);
    const type = await p.locator("#notes p").first().evaluate(async (el) => {
      const faces = await document.fonts.load('400 17px "Source Sans 3"', "ZPI");
      const css = getComputedStyle(el);
      return [faces.length > 0, css.fontSize, css.fontWeight, css.lineHeight];
    });
    assert.deepEqual(type, [true, "17px", "400", "28.9px"]);
    const d = p.frameLocator("#live");
    const dockIcons = d.locator(".dock button[data-open] img");
    for (const icon of [p.locator(".brand img"), ...[0, 1, 2].map((i) => dockIcons.nth(i))]) {
      assert.match(await icon.getAttribute("src"), /^data:image\/svg\+xml,/);
      await icon.evaluate((img) => img.decode());
    }
    await d.frameLocator("#zpi-frame").locator("main.main").waitFor();
    await p.locator('.products [data-product="zpi-quick-chat"]').click();
    await d.frameLocator("#quick-frame").locator("#input").fill("路径测试");
    await p.locator('.products [data-product="zpi-agent-sdk"]').click();
    await d.locator("#sdk-form button").click();
    await d.locator("#sdk-output").filter({ hasText: "你好，我是 zpi agent sdk。" }).waitFor();
    assert.equal(p.url(), home);
    await p.goBack();
    await p.locator('html[data-product="zpi-quick-chat"]').waitFor();
    assert.equal(p.url(), home);
    await p.goForward();
    await p.locator('html[data-product="zpi-agent-sdk"]').waitFor();
    await p.reload();
    await p.locator('html[data-product="zpi"]').waitFor();
    assert.equal(p.url(), home);
    await p.goto(at("?product=zpi-quick-chat"));
    await p.locator('html[data-product="zpi-quick-chat"]').waitFor();
    await p.locator('.products [data-product="zpi-agent-sdk"]').click();
    assert.equal(p.url(), home);
    await p.locator("#manual-link").click();
    assert.equal(p.url(), at("manuals/zpi-agent-sdk/index.html"));
    await p.locator('article a[href="start/first.html"]').first().click();
    await p.reload();
    await p.locator("article pre code.language-ts").waitFor();
    const source = await p.locator('article a[download="first-query.mts"]').getAttribute("href");
    assert.match(await (await fetch(new URL(source, p.url()))).text(), /import \{ query \}/);
    await p.getByRole("link", { name: "返回 ZPI Agent SDK 产品介绍" }).click();
    await p.locator('html[data-product="zpi-agent-sdk"]').waitFor();
    assert.equal(new URL(await p.locator("#standalone").getAttribute("href")).pathname, mount + "/demo.html");
    await p.goto(at("demo.html?app=zpi&autoplay=1"));
    await p
      .frameLocator("#zpi-frame")
      .frameLocator(".pane-content:not([hidden]) .browser-webview iframe")
      .locator("#start")
      .click({ timeout: 45000 });
    await p.goto(at("manuals/zpi/how-to/review.html#last-turn"));
    await p.locator(":target a").click();
    assert.equal(p.url(), at("manuals/zpi/review/last-turn.html"));
    await p.goto(at("manuals/zpi/start/first-model.html"));
    await p.locator("article img").evaluate((im) => im.decode());
    await p.goto(at("?ref=guide&product=zpi-agent-sdk#notes"));
    await p.locator('html[data-product="zpi-agent-sdk"]').waitFor();
    await p.locator('.products [data-product="zpi"]').click();
    assert.equal(p.url(), at("?ref=guide#notes"));
    await p.goBack();
    await p.locator('html[data-product="zpi-agent-sdk"]').waitFor();
    assert.deepEqual(bad, [], "unexpected network paths");
    for (const path of [
      "manuals/",
      "reading/reading.css",
      "reading/theme.css",
      "reading/theme.js",
      "reading/fonts/source-sans-3-roman.woff2",
      "reading/fonts/source-sans-3-italic.woff2",
      "reading/fonts/SourceSans3-OFL.txt",
      "manuals/media/zpi.svg",
      "manuals/media/quick-chat.svg",
      "manuals/media/agent-sdk.svg",
      "source-versions.json",
      "pdfjs/standard_fonts/FoxitFixed.pfb",
    ])
      assert.equal((await fetch(at(path), { method: "HEAD" })).status, 200, path);
    assert.equal((await fetch(at("assets/not-a-chunk.js"))).status, 404);
    console.log(
      `Verified ${mount || "/"}: shared theme and cross-tab sync, homepage, history, 3 embeds, Snake, direct manuals, media and asset 404.`,
    );
  } finally {
    await c.close();
  }
}
try {
  for (const mount of ["", "/zpi"]) {
    const s = spawn(process.execPath, [resolve(root, "scripts/serve.cjs")], {
      env: { ...process.env, STATIC_ROOT: resolve(root, "dist"), PORT: "0", MOUNT_PATH: mount },
      stdio: ["ignore", "pipe", "inherit"],
    });
    try {
      await exercise(String((await once(s.stdout, "data"))[0]).match(/http:\/\/\S+/)[0], mount);
    } finally {
      s.kill();
    }
  }
} finally {
  await browser.close();
}
