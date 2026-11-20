const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { createRequire } = require("node:module");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const zpi = path.resolve(process.env.ZPI_SOURCE || path.join(__dirname, "../../zpi"));
const quick = path.resolve(process.env.QUICK_CHAT_SOURCE || path.join(__dirname, "../../zpi-quick-chat"));
const { chromium } = createRequire(path.join(zpi, "package.json"))("playwright");
const base = "http://127.0.0.1:4179";
const artifacts = process.env.ARTIFACT_DIR || path.join(os.tmpdir(), "zpi-source-ui-tests");
fs.mkdirSync(artifacts, { recursive: true });
const server = spawn(process.execPath, [path.join(__dirname, "../scripts/serve.cjs")], {
  env: { ...process.env, PORT: "4179" },
  stdio: "pipe",
});
const errors = [],
  network = [];
let browser;
async function pageAt(query = "?autoplay=0") {
  const context = await browser.newContext({ viewport: { width: 1470, height: 956 }, colorScheme: "light" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(base)) network.push(request.url());
  });
  await page.goto(base + "/demo.html" + query);
  const product = new URLSearchParams(query).get("app");
  const firstWindow =
    product === "zpi-quick-chat"
      ? "#quick-frame"
      : product === "zpi-agent-sdk"
        ? "#info-window"
        : "#zpi-native-window";
  await page.locator(firstWindow).waitFor();
  return { page, context, z: page.frameLocator("#zpi-frame"), q: page.frameLocator("#quick-frame") };
}
async function checkUtilityGeometry(root, id, compareToZpi = false) {
  const [desktop, win, dock, zpi] = await Promise.all(
    ["#desktop", "#mac-" + id, ".dock", "#zpi-native-window"].map((selector) =>
      root.locator(selector).boundingBox(),
    ),
  );
  const dx = win.x + win.width / 2 - (desktop.x + desktop.width / 2);
  const dy = win.y + win.height / 2 - (desktop.y + (desktop.height - 68) / 2);
  assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `${id} center offset ${dx}, ${dy}`);
  assert.ok(
    win.y + win.height <= dock.y && win.x >= desktop.x && win.x + win.width <= desktop.x + desktop.width,
  );
  if (compareToZpi) {
    const ratio = win.width / zpi.width;
    assert.ok(
      ratio >= (id === "finder" ? 0.55 : 0.49) && ratio <= 0.96 && win.height < zpi.height * 0.85,
      `${id} relative size: ${ratio}`,
    );
  }
  return win;
}
async function assertDockedSidebar(z) {
  const sidebar = z.locator(".workspace-surface > .sidebar");
  await sidebar.waitFor();
  assert.equal(await z.getByTestId("left-sidebar-toggle").getAttribute("aria-expanded"), "true");
  const side = await sidebar.boundingBox();
  for (const selector of [".main", ".right-pane"]) {
    const panel = await z.locator(".workspace-surface > " + selector).boundingBox();
    if (panel) assert.ok(side.x + side.width <= panel.x + 1, `left sidebar overlaps ${selector}`);
  }
}
async function checkWideShowcase(page, app, startButton) {
  const stage = page.locator("#live");
  for (const [width, height, expectedHeight] of [[1600, 900, 680], [1920, 1080, 720], [2560, 1440, 720]]) {
    await page.setViewportSize({ width, height });
    assert.equal((await stage.boundingBox()).height, expectedHeight);
    await page.waitForFunction(() => {
      const desktop = document.querySelector("#live").contentDocument;
      return desktop.querySelector("#zpi-frame").contentDocument.querySelector(".sidebar").getBoundingClientRect().width === 200;
    });
    const widths = await app.locator(".workspace-surface").evaluate((w) =>
      [".sidebar", "main.main", ".right-pane"].map((s) => w.querySelector(s).getBoundingClientRect().width),
    );
    assert.ok(widths[1] > widths[0] && widths[1] > widths[2], `wide showcase columns: ${widths}`);
    const names = await app.locator(".session-name .task-title-overflow").evaluateAll((els) =>
      els.filter((el) => el.clientWidth >= el.querySelector(".task-title-copy").scrollWidth)
        .map((el) => el.querySelector(".task-title-copy").textContent),
    );
    assert.deepEqual(names, ["演示任务", "复杂任务"]);
    assert.equal(await app.locator(".sidebar .task-question-badge").getByText("等待确认", { exact: true }).isVisible(), true);
    assert.ok(await startButton.evaluate((button) => {
      const r = button.getBoundingClientRect(), board = button.closest(".board").getBoundingClientRect();
      return r.top >= board.top && r.bottom <= board.bottom;
    }), `Snake start button clipped at ${width}×${height}`);
    if (width === 1920) await page.screenshot({ path: path.join(artifacts, "intro-wide-zpi.png") });
  }
  const splitter = app.locator(".sidebar-resizer");
  await splitter.press("ArrowRight");
  for (const [width, height] of [[1599, 1080], [1920, 899]]) {
    await page.setViewportSize({ width, height });
    assert.ok((await stage.boundingBox()).height <= 620, "short or narrow viewports keep the original stage");
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await app.locator('.sidebar-resizer[aria-valuenow="216"]').waitFor();
  await splitter.press("ArrowLeft");
  await page.setViewportSize({ width: 1440, height: 900 });
}
async function checkShowcaseSettings() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base);
    const stage = page.locator("#live"), desktop = page.frameLocator("#live"), app = desktop.frameLocator("#zpi-frame");
    const sidebar = app.getByTestId("left-sidebar-toggle");
    await sidebar.waitFor();
    assert.equal(await sidebar.getAttribute("aria-expanded"), "false");
    assert.ok((await app.locator("main.main").boundingBox()).width > 300);
    assert.ok(await stage.evaluate(el => el.getBoundingClientRect().width >= document.querySelector('.workbench').clientWidth - 1 && el.getBoundingClientRect().bottom <= document.querySelector('#install').getBoundingClientRect().top));
    await sidebar.tap();
    await app.getByRole("button", { name: "设置", exact: true }).tap();
    const settings = app.locator(".settings-screen"), tabs = settings.locator(".settings-tabs");
    for (const width of [320, 390, 1366, 1920]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1080 });
      await tabs.getByRole("button", { name: "界面设置", exact: true }).click();
      const panel = await settings.locator(".settings-main").boundingBox();
      const nav = await settings.locator(".settings-sidebar").boundingBox();
      assert.ok(panel.height > 140 && panel.width > 240, `visible settings form at ${width}`);
      if (width < 500) assert.ok(nav.y + nav.height <= panel.y + 1, "phone navigation above form");
      else assert.ok(nav.x + nav.width <= panel.x + 1, "desktop navigation beside form");
      assert.ok(await settings.locator(".settings-back span").evaluate(el => el.clientWidth > 12 && getComputedStyle(el).clipPath === "none"));
      const theme = app.getByRole("combobox", { name: "界面主题", exact: true });
      await theme.click();
      const themeName = width === 320 ? "深色" : "浅色";
      await app.getByRole("option", { name: themeName, exact: true }).click();
      assert.ok((await theme.innerText()).includes(themeName));
      await tabs.getByRole("button", { name: "模型", exact: true }).click();
      const providers = settings.getByRole("navigation", { name: "提供商列表" });
      for (const [label, protocol] of [["DeepSeek", "OpenAI Chat Completions"], ["OpenAI", "OpenAI Responses"]]) {
        const provider = providers.getByRole("button", { name: label, exact: true });
        assert.ok(await provider.locator("span").filter({ hasText: label }).isVisible());
        await provider.click();
        await settings.locator("#provider-api-format").filter({ hasText: protocol }).waitFor();
      }
      assert.ok(await settings.locator(".settings-scroll").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      if (width === 390 || width === 1920) await stage.screenshot({ path: path.join(artifacts, `settings-model-${width}.png`) });
      await settings.getByRole("button", { name: "编辑模型 gpt-6.2-sol", exact: true }).click();
      const dialog = app.getByRole("dialog", { name: "编辑模型配置" });
      const capacity = dialog.getByLabel("上下文容量");
      await capacity.fill("16384");
      assert.equal(await capacity.inputValue(), "16384");
      assert.ok(await capacity.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.x >= 0 && rect.right <= innerWidth && rect.width >= 200;
      }));
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
    }
    await settings.locator(".settings-back").click();
    await app.locator(".sidebar .session-row.active").filter({ hasText: "演示任务" }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await sidebar.getAttribute("aria-expanded"), "true", "a manual sidebar choice survives resize");
  } finally { await context.close(); }
  console.log("PASS: phone demo first, readable settings navigation and usable appearance/model forms across phone and desktop embeds");
}
async function checkLaptopPreview(page, app) {
  const card = app.locator('.assistant-preview-card[data-preview-type="website"]');
  for (const width of [1536, 1470, 1366, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await card.scrollIntoViewIfNeeded();
    const layout = await card.evaluate((el) => {
      const rect = (node) => node.getBoundingClientRect();
      const row = rect(el), title = el.querySelector(".assistant-preview-title");
      const buttons = [...el.querySelectorAll("button")].map(rect);
      return {
        frame: innerWidth,
        columns: [".sidebar", "main.main", ".right-pane"].map((s) => rect(document.querySelector(s)).width),
        name: title.textContent, fullTitle: title.clientWidth >= title.scrollWidth,
        contained: buttons.length === 2 && buttons.every((b) => b.width > 0 && b.left >= row.left && b.right <= row.right && b.top >= row.top && b.bottom <= row.bottom),
        stacked: buttons[0].top >= rect(title).bottom,
        cardWidth: row.width,
      };
    });
    const [left, center, right] = layout.columns;
    assert.ok(center > left && center > right && left > 0 && right > 0, JSON.stringify(layout));
    if (width >= 1470) assert.ok(center >= layout.frame * 0.49 && right <= layout.frame * 0.31, JSON.stringify(layout));
    assert.equal(layout.name, "snake.html");
    assert.ok(layout.fullTitle && layout.contained, JSON.stringify(layout));
    assert.equal(layout.stacked, layout.cardWidth <= 248);
  }
  await card.getByRole("button", { name: "选择打开方式" }).click();
  const menuItem = app.getByRole("menuitem", { name: "使用默认程序打开" });
  await menuItem.waitFor();
  await menuItem.press("Escape");
  await app.getByTestId("right-sidebar-toggle").click();
  await app.locator(".right-pane").waitFor({ state: "hidden" });
  await card.getByRole("button", { name: "打开", exact: true }).click();
  await app.frameLocator('.pane-content:not([hidden]) .browser-webview iframe').locator("#start").waitFor();
}
async function assertDarkZpiRim(page, frame) {
  const { x, y, width } = await frame.boundingBox();
  const strip = await page.screenshot({
    clip: { x: Math.floor(x + width / 2), y: Math.ceil(y), width: 1, height: 4 },
  });
  const brightest = await page.evaluate(
    async (bytes) => {
      const image = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: "image/png" }));
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.drawImage(image, 0, 0);
      image.close();
      return Math.max(...ctx.getImageData(0, 0, 1, 4).data.filter((_, i) => i % 4 !== 3));
    },
    [...strip],
  );
  assert.ok(brightest < 90, `unexpected light pixels at top of dark ZPI window: ${brightest}`);
}
async function assertTransparentQuickCorners(page) {
  const frame = page.locator("#quick-frame");
  await frame.evaluate((node) => Promise.all(node.getAnimations().map((a) => a.finished)));
  const { x, y, width, height } = await frame.boundingBox();
  const sample = () =>
    Promise.all(
      [Math.ceil(x) + 1, Math.floor(x + width) - 3].flatMap((left) =>
        [Math.ceil(y) + 1, Math.floor(y + height) - 3].map((top) =>
          page.screenshot({ clip: { x: left, y: top, width: 2, height: 2 } }),
        ),
      ),
    );
  const visible = await sample();
  const style = await page.addStyleTag({ content: "#quick-frame { opacity: 0 !important; }" });
  try {
    assert.deepEqual(visible, await sample(), "Each rounded corner must show the desktop behind the iframe");
  } finally {
    await style.evaluate((node) => node.remove());
  }
}
async function complete(page) {
  await page.waitForFunction(
    () => {
      const store = document.querySelector("#zpi-frame").contentWindow.zpiDemo.useStore.getState();
      return store.views.get(store.selected)?.runs.at(-1)?.status === "completed";
    },
    null,
    { timeout: 20000 },
  );
}
async function send(page, text = "任意输入") {
  const editor = page.frameLocator("#zpi-frame").locator("[contenteditable=true]").first();
  await editor.fill(text);
  await editor.press("Enter");
  await page.waitForFunction(() => {
    const w = document.querySelector("#zpi-frame").contentWindow,
      s = w.zpiDemo.useStore.getState();
    return (
      s.views.get(s.selected)?.runs.at(-1)?.status === "running" &&
      w.document.querySelector('.send.stop, [data-testid="process"], .run-progress, .assistant-turn')
    );
  });
}
async function diagnostics(page) {
  const result = await page.evaluate(() => {
    const diagnostics = document.querySelector("#zpi-frame").contentWindow.zpiDemo.diagnostics;
    return { errors: diagnostics.errors, unsupported: [...diagnostics.unsupportedCalls] };
  });
  assert.deepEqual(result, { errors: [], unsupported: [] });
}
async function quickBounds(page) {
  return page.evaluate(() => ({ ...window.zpiSite.quickWindow.applied }));
}
(async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const manifest = await (await fetch(base + "/source-versions.json")).json();
  for (const [key, source] of Object.entries({
    "zpi/App.tsx": path.join(zpi, "packages/desktop/src/renderer/App.tsx"),
    "zpi/SettingsPage.tsx": path.join(zpi, "packages/desktop/src/renderer/SettingsPage.tsx"),
    "zpi/workbench.css": path.join(zpi, "packages/desktop/src/renderer/workbench.css"),
    "zpi/ui/styles.css": path.join(zpi, "packages/ui/src/styles.css"),
    "quick/index.html": path.join(quick, "src/index.html"),
    "quick/renderer.ts": path.join(quick, "src/renderer.ts"),
    "quick/style.css": path.join(quick, "src/style.css"),
    "quick/window.ts": path.join(quick, "src/window.ts"),
  }))
    assert.equal(
      manifest.sourceHashes[key],
      createHash("sha256").update(fs.readFileSync(source)).digest("hex"),
      key,
    );
  console.log(
    "PASS: original App, SettingsPage, UI styles, Quick Chat HTML/renderer/styles/window geometry source hashes",
  );
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  await checkShowcaseSettings();
  {
    const context = await browser.newContext();
    const origin = "http://showcase.invalid";
    await context.route(origin + "/**", async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: base + url.pathname + url.search }) });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/demo.html?app=zpi&autoplay=1");
    assert.equal(await page.evaluate(() => isSecureContext), false);
    await page.locator('[data-file$="/snake.html"]').waitFor({ timeout: 25000 });
    await page.frameLocator("#zpi-frame").frameLocator(".browser-webview iframe").locator("#start").waitFor();
    assert.match(await page.evaluate(() => crypto.randomUUID()), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    await context.close();
    console.log("PASS: non-local HTTP desktop can generate IDs and open the playable preview");
  }
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
      colorScheme: "dark",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    assert.ok(
      (await page.locator("#install").boundingBox()).x < (await page.locator("#live").boundingBox()).x,
    );
    assert.equal(await page.locator("#headline").textContent(), "极简的界面，收敛的功能。");
    assert.equal(await page.locator(".products [aria-current=page]").textContent(), "ZPI");
    await page.frameLocator("#live").locator('[data-file$="/snake.html"]').waitFor({ timeout: 25000 });
    const startButton = page
      .frameLocator("#live")
      .frameLocator("#zpi-frame")
      .frameLocator(".browser-webview iframe")
      .locator("#start");
    await startButton.waitFor();
    assert.ok(
      await startButton.evaluate((button) => {
        const r = button.getBoundingClientRect(),
          board = button.closest(".board").getBoundingClientRect();
        return r.top >= board.top && r.bottom <= board.bottom;
      }),
    );
    await page.screenshot({ path: path.join(artifacts, "intro-desktop.png") });
    const homeDocument = await page.evaluateHandle(() => document);
    const desktop = page.frameLocator("#live");
    const themeSwitch = page.getByRole("button", { name: "深色模式" });
    const app = desktop.frameLocator("#zpi-frame");
    assert.equal(await page.locator("html").getAttribute("data-site-theme"), "light");
    await app.locator("html[data-theme=light]").waitFor();
    await checkWideShowcase(page, app, startButton);
    await themeSwitch.click();
    await app.locator("html[data-theme=dark]").waitFor();
    await assertDarkZpiRim(page, desktop.locator("#zpi-native-window"));
    await assertDockedSidebar(app);
    assert.equal(await desktop.locator('[data-file$="/snake.html"]').count(), 1);
    assert.match(await page.locator("#standalone").getAttribute("href"), /theme=dark/);
    for (const [action, id] of [
      ["files", "finder"],
      ["terminal", "terminal"],
    ]) {
      await desktop.locator(`.dock [data-action=${action}]`).click();
      await checkUtilityGeometry(desktop, id, true);
      await page.screenshot({ path: path.join(artifacts, `intro-${id}.png`) });
      await desktop.locator(`#mac-${id} [data-win=close]`).click();
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await desktop.locator(".dock [data-action=files]").click();
    await checkUtilityGeometry(desktop, "finder");
    await desktop.locator("#mac-finder [data-win=close]").click();
    await checkLaptopPreview(page, app);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(".products").getByRole("link", { name: "ZPI Quick Chat", exact: true }).click();
    await page
      .frameLocator("#live")
      .frameLocator("#quick-frame")
      .getByText(/小工具也能带来大改变/)
      .last()
      .waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.product), "zpi-quick-chat");
    assert.equal(await page.locator("#command").textContent(), "npx @zpi-dev/quick-chat");
    assert.equal(await page.locator("#headline").textContent(), "叫出来问。用完收起。");
    assert.equal(await desktop.locator("#zpi-frame").getAttribute("src"), null);
    await page.setViewportSize({ width: 1920, height: 1080 });
    assert.equal((await page.locator("#live").boundingBox()).height, 720);
    const quick = desktop.frameLocator("#quick-frame");
    const inputColor = () => quick.locator("#composer").evaluate((n) => getComputedStyle(n).backgroundColor);
    assert.equal(await inputColor(), "rgb(43, 43, 43)");
    await themeSwitch.click();
    assert.equal(await inputColor(), "rgb(255, 255, 255)");
    assert.ok(
      await quick
        .getByText(/小工具也能带来大改变/)
        .last()
        .isVisible(),
    );
    await page.locator(".products").getByRole("link", { name: "ZPI Agent SDK", exact: true }).click();
    await page.frameLocator("#live").getByText("你好，我是 zpi agent sdk。", { exact: true }).waitFor();
    assert.equal((await page.locator("#live").boundingBox()).height, 720);
    assert.equal(await page.frameLocator("#live").locator("#zpi-frame").getAttribute("src"), null);
    assert.equal(await page.frameLocator("#live").locator("#quick-frame").getAttribute("src"), null);
    await page.locator("#copy-command").click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "npm install @zpi-dev/agent-sdk");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, "intro-mobile.png") });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goBack();
    await page.waitForSelector("html[data-product=zpi-quick-chat]");
    await page.goBack();
    await page.waitForSelector("html[data-product=zpi]");
    await page.goForward();
    await page.waitForSelector("html[data-product=zpi-quick-chat]");
    assert.equal(await page.evaluate((original) => document === original, homeDocument), true);
    assert.equal(await page.locator("#live").count(), 1);
    assert.equal(await page.locator(".products [aria-current]").count(), 1);
    assert.equal(await page.locator("#copy-status").textContent(), "");
    await page.reload();
    assert.match(await page.locator("#live").getAttribute("src"), /autoplay=0/);
    await context.close();
    console.log(
      "PASS: product navigation, single live embed, installation clipboard, mobile and reduced motion",
    );
  }
  {
    const { page, context, z } = await pageAt();
    assert.equal(await z.locator(".shell.mac-desktop").count(), 1);
    assert.equal(await z.locator("html").getAttribute("data-theme"), "light");
    const layout = await page.evaluate(() => {
      const doc = document.querySelector("#zpi-frame").contentDocument;
      return {
        font: doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue("--ui-font-size").trim(),
        width: doc.defaultView.getComputedStyle(doc.querySelector(".sidebar")).width,
      };
    });
    assert.equal(layout.font, "14px");
    assert.equal(layout.width, "260px");
    assert.deepEqual(await page.locator("#desktop-files button").allTextContents(), []);
    assert.equal(await page.locator("#active-app").innerText(), "ZPI");
    assert.equal(
      await page.locator(".system-menu [data-open],[data-action=install],[data-action=replay]").count(),
      0,
    );
    await z.locator(".topbar-drag-space").dblclick();
    assert.equal((await page.locator("#zpi-native-window").boundingBox()).width, 1470);
    await z.locator(".topbar-drag-space").dblclick();
    await page.screenshot({ path: path.join(artifacts, "zpi-home.png") });
    const restored = await page.locator("#zpi-native-window").boundingBox();
    assert.equal(restored.width, 1200);
    assert.equal(restored.height, 800);
    for (const viewport of [
      { width: 1470, height: 740 },
      { width: 800, height: 600 },
      { width: 390, height: 844 },
      { width: 320, height: 500 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(80);
      const box = await page.locator("#zpi-native-window").boundingBox();
      const metrics = await page.locator("#zpi-native-window").evaluate((win) => {
        const doc = win.querySelector("iframe").contentDocument;
        return {
          scale: win.getBoundingClientRect().width / win.offsetWidth,
          frameWidth: doc.defaultView.innerWidth,
          font: doc.defaultView.getComputedStyle(doc.querySelector(".session-row")).fontSize,
        };
      });
      assert.ok(Math.abs(metrics.scale - 1) < 0.005);
      assert.ok(Math.abs(metrics.frameWidth - box.width) < 4);
      assert.equal(metrics.font, "14px");
      assert.ok(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width + 1 &&
          box.y + box.height <= viewport.height - 66,
      );
      assert.ok(Math.abs(box.width / box.height - 1.5) < 0.002);
      await assertDockedSidebar(z);
      await z.getByTestId("right-sidebar-toggle").click();
      await z.locator(".right-pane:not([hidden])").waitFor();
      await assertDockedSidebar(z);
      if (metrics.frameWidth <= 550) assert.equal(await z.locator("main.main").isVisible(), false);
      else {
        const [main, pane] = await Promise.all([
          z.locator("main.main").boundingBox(),
          z.locator(".right-pane").boundingBox(),
        ]);
        assert.ok(main.x + main.width <= pane.x + 1, `overlapping split at ${metrics.frameWidth}`);
      }
      await z.getByTestId("right-sidebar-toggle").click();
      await z.locator("main.main").waitFor();
    }
    await z.getByTestId("left-sidebar-toggle").click();
    await z.locator(".sidebar").waitFor({ state: "hidden" });
    await page.setViewportSize({ width: 1470, height: 956 });
    await page.waitForFunction(() => document.querySelector("#zpi-frame").contentWindow.innerWidth === 1200);
    assert.equal(await z.getByTestId("left-sidebar-toggle").getAttribute("aria-expanded"), "false");
    await z.getByTestId("left-sidebar-toggle").click();
    await assertDockedSidebar(z);
    await z.locator(".model-trigger").click();
    for (const name of ["GPT-6.2 Sol", "GPT-6.2 Astra", "GPT-6.1 Terra", "GPT-6 Luna", "DeepSeek V4.1 Flash"])
      await z.locator(".model-menu").getByText(name, { exact: true }).waitFor();
    await z.getByText("DeepSeek V4.1 Flash", { exact: true }).click();
    await z.locator(".model-trigger").filter({ hasText: "DeepSeek V4.1 Flash" }).waitFor();
    await z.getByRole("button", { name: "设置", exact: true }).click();
    assert.equal(await z.locator(".shell.show-settings").count(), 1);
    assert.equal(await z.locator("[role=dialog]:visible").count(), 0);
    for (const name of [
      "常规",
      "界面设置",
      "快捷键",
      "系统提示词",
      "工具",
      "技能",
      "命令",
      "模型",
      "插件",
      "钩子",
      "联网搜索",
      "子智能体",
      "记忆",
      "已归档任务",
    ]) {
      await z.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(100);
    }
    await z.getByRole("button", { name: "界面设置", exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, "zpi-settings.png") });
    await z.locator(".settings-back").click();
    await z.locator(".sidebar").getByText("复杂任务", { exact: true }).first().click();
    await z.locator("body.demo-read-only").waitFor();
    assert.ok(!await z.locator(".composer-container").first().evaluate(el => getComputedStyle(el, "::before").content.includes("只读")));
    await z.locator(".user-question-card[inert]").waitFor();
    await z.locator(".conversation-navigator[data-visible=true]").waitFor();
    assert.ok(await z.locator(".task-activity[data-running=true]").count());
    const fixture = await page.evaluate(async () => {
      const w = document.querySelector("#zpi-frame").contentWindow,
        store = w.zpiDemo.useStore.getState(),
        v = store.views.get(store.selected);
      const sid = store.selected;
      const attempts = await Promise.all([
        w.zpi.submitInput({ sessionId: sid, text: "禁止" }),
        w.zpi.abortRun({ sessionId: sid, runId: v.runs.at(-1).runId }),
        w.zpi.forkSession(sid, v.runs[0].runId),
        w.zpi.renameSession(sid, "禁止"),
        w.zpi.updateTaskGroups({ type: "taskTop", id: sid }),
      ]);
      return {
        status: [v.backgroundTasks[0].status, v.subagents[0].status],
        attempts: attempts.map((result) => result.ok),
        tools: (await w.zpi.listTools()).value.length,
      };
    });
    assert.deepEqual(fixture, { status: ["running", "running"], attempts: Array(5).fill(false), tools: 11 });
    await z.locator(".sidebar").getByText("演示任务", { exact: true }).first().click();
    await z.locator(".composer-container [contenteditable=true]:not([inert])").first().waitFor();
    await diagnostics(page);
    await context.close();
    console.log("PASS: original desktop layout, 14 settings pages, settings are in-place instead of a modal");
  }
  {
    const { page, context, z } = await pageAt("");
    const taskOrder = () =>
      z
        .locator(".sidebar")
        .getByText(/^(复杂任务|演示任务)$/)
        .allTextContents();
    assert.deepEqual(await taskOrder(), ["复杂任务", "演示任务"]);
    await page.waitForFunction(() => {
      const doc = document.querySelector("#zpi-frame").contentDocument,
        el = doc.querySelector("[contenteditable=true]"),
        sel = doc.getSelection();
      return (
        el?.textContent.length >= 3 && doc.activeElement === el && sel?.focusOffset === el.textContent.length
      );
    });
    await z.locator("[data-testid=thinking-block]").first().waitFor();
    await z.locator("[data-tool-name=write]").waitFor();
    assert.deepEqual(await taskOrder(), ["演示任务", "复杂任务"]);
    await complete(page);
    const preview = z.frameLocator(".browser-webview iframe");
    await preview.locator("#start").click();
    assert.deepEqual(await taskOrder(), ["演示任务", "复杂任务"]);
    assert.equal(await preview.locator("#overlay").isVisible(), false);
    await preview.locator("canvas").press("Space");
    assert.equal(await preview.locator("#heading").textContent(), "休息一下");
    assert.equal(await page.locator('[data-file$="/snake.html"]').count(), 1);
    await page.screenshot({ path: path.join(artifacts, "zpi-browser.png") });
    const popupPromise = context.waitForEvent("page");
    await z.getByRole("button", { name: "在外部浏览器打开", exact: true }).click();
    const popup = await popupPromise;
    await popup.frameLocator("iframe").locator("#start").click();
    assert.equal(await popup.frameLocator("iframe").locator("#overlay").isVisible(), false);
    await popup.close();
    await page.locator(".dock [data-open=quick]").click();
    const q = page.frameLocator("#quick-frame");
    await q.locator("#bash").click();
    await q.locator("#input").fill("清理");
    await q.locator("#input").press("Enter");
    await preview.getByText(/已被清理/).waitFor();
    assert.equal(await page.locator('[data-file$="/snake.html"]').count(), 0);
    await page.evaluate(() => window.zpiSite.files.write("/Users/demo/Desktop/snake.html", window.ZpiSnake));
    await preview.locator("#start").waitFor();
    await page.locator(".dock [data-open=zpi]").click();
    const htmlPath = "/Users/demo/Desktop/example #1.html";
    await page.evaluate(async (path) => {
      window.zpiSite.files.write(path, "<h1>原始预览</h1>");
      const frame = document.querySelector("#zpi-frame").contentWindow;
      await frame.zpiDemo.openFile(path);
    }, htmlPath);
    const updatedPreview = z.frameLocator(".browser-webview iframe:visible");
    await updatedPreview.getByRole("heading", { name: "原始预览" }).waitFor();
    await page.evaluate((path) => window.zpiSite.files.write(path, "<h1>已更新预览</h1>"), htmlPath);
    await updatedPreview.getByRole("heading", { name: "已更新预览" }).waitFor();
    const address = z.getByRole("textbox", { name: "浏览器地址" });
    await address.fill("file:///Users/demo/Desktop/snake.html");
    await address.press("Enter");
    await updatedPreview.locator("#start").waitFor();
    await z.getByRole("button", { name: "浏览器后退" }).click();
    await updatedPreview.getByRole("heading", { name: "已更新预览" }).waitFor();
    await z.getByRole("button", { name: "浏览器前进" }).click();
    await updatedPreview.locator("#start").waitFor();
    await diagnostics(page);
    await context.close();
    console.log(
      "PASS: autoplay through original conversation and browser panes, real playable snake and shared desktop file",
    );
  }
  {
    const { page, context, z } = await pageAt();
    await send(page, "今天的天气如何？");
    assert.equal(await page.locator("#notice").isHidden(), true);
    await z.getByRole("button", { name: "设置", exact: true }).click();
    await z.getByRole("button", { name: "模型", exact: true }).click();
    await complete(page);
    assert.equal(await page.locator("#notice").isHidden(), true);
    assert.equal(await z.locator(".shell.show-settings").count(), 1);
    assert.equal(await z.locator(".browser-webview").count(), 0);
    await z.locator(".settings-back").click();
    const state = await page.evaluate(() => {
      const store = document.querySelector("#zpi-frame").contentWindow.zpiDemo.useStore.getState();
      return store.views.get(store.selected).runs.at(-1).userMessage;
    });
    assert.equal(state, "编写一个 HTML 版贪吃蛇游戏");
    await page.locator(".dock [data-action=terminal]").click();
    const terminal = page.locator("#mac-terminal input");
    const initial = await checkUtilityGeometry(page, "terminal", true);
    const handle = await page.locator("#mac-terminal .mac-title strong").boundingBox();
    await page.mouse.move(handle.x + 5, handle.y + 5);
    await page.mouse.down();
    await page.mouse.move(handle.x + 75, handle.y + 35);
    await page.mouse.up();
    const moved = await page.locator("#mac-terminal").boundingBox();
    assert.ok(Math.abs(moved.x - initial.x - 70) < 2 && Math.abs(moved.y - initial.y - 30) < 2);
    await page.locator("#mac-terminal [data-win=min]").click();
    await page.locator(".dock [data-action=terminal]").click();
    assert.deepEqual(await page.locator("#mac-terminal").boundingBox(), moved);
    await page.locator("#mac-terminal [data-win=close]").click();
    await page.locator(".dock [data-action=terminal]").click();
    await checkUtilityGeometry(page, "terminal", true);
    assert.equal(await page.locator("#active-app").innerText(), "终端");
    await page.locator("#mac-terminal .mac-title strong").dblclick();
    assert.equal(await page.locator("#mac-terminal.zoom").count(), 1);
    await page.locator("#mac-terminal [data-win=zoom]").click();
    await terminal.fill("cd ~/Des");
    await terminal.press("Tab");
    assert.equal(await terminal.inputValue(), "cd ~/Desktop/");
    await terminal.press("Enter");
    await terminal.pressSequentially("echo hello > parity.txt");
    await terminal.press("Enter");
    assert.equal(
      await page.evaluate(() => window.zpiSite.files.read("/Users/demo/Desktop/parity.txt")),
      "hello\n",
    );
    await page.locator(".dock [data-action=files]").click();
    assert.equal(await page.locator("#active-app").innerText(), "访达");
    assert.equal(await page.locator(".finder-sidebar [data-dir]").count(), 2);
    assert.equal(
      await page.locator("#mac-finder input,[data-f=remove],[data-f=download],[data-f=rename]").count(),
      0,
    );
    await page.locator("#mac-finder .finder-tools strong").dblclick();
    assert.equal(await page.locator("#mac-finder.zoom").count(), 1);
    await page.locator("#mac-finder .finder-tools strong").dblclick();
    await page.locator('.finder-sidebar [data-dir="/"]').click();
    assert.equal(await page.locator("#mac-finder [role=option]").count(), 1);
    await page.locator('#mac-finder [data-item="/Users"]').dblclick();
    await page.locator('#mac-finder [data-item="/Users/demo"]').dblclick();
    await page.locator('#mac-finder [data-item="/Users/demo/Desktop"]').dblclick();
    const file = page.locator("#mac-finder").getByRole("option", { name: /parity.txt/ });
    await file.dblclick();
    assert.equal(await page.locator("#mac-textedit textarea").inputValue(), "hello\n");
    assert.equal(await page.locator("#active-app").textContent(), "文本编辑");
    assert.equal(await page.locator("#mac-finder[data-active]").count(), 0);
    await page.locator("#mac-textedit textarea").fill("line 1\n\nline 3");
    assert.equal(
      await page.evaluate(() => window.zpiSite.files.read("/Users/demo/Desktop/parity.txt")),
      "line 1\n\nline 3",
    );
    await page.locator("#mac-textedit [data-win=close]").click();
    assert.equal(await z.locator(".xterm-helper-textarea").count(), 0);
    await page.locator('[aria-label="关闭访达"]').click();
    await page.locator('[aria-label="关闭终端"]').click();
    assert.equal(await page.locator("#active-app").innerText(), "ZPI");
    await page.evaluate(async () => {
      localStorage.setItem("keep-test", "untouched");
      localStorage.setItem("zpi-web-v2:files", "{broken legacy snapshot}");
      const frame = document.querySelector("#zpi-frame").contentWindow;
      frame.localStorage.setItem("frame-only", "draft");
      const res = await frame.zpi.updatePreferences({ fontSize: 19, theme: "dark" });
      if (!res.ok || res.value.interface.fontSize !== 19) throw Error("could not set preferences");
    });
    await z.locator("html[data-theme=dark]").waitFor();
    assert.equal(await page.locator("html").getAttribute("data-site-theme"), "light");
    await assertDarkZpiRim(page, page.locator("#zpi-native-window"));
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#zpi-frame").contentWindow.zpiDemo);
    await page.evaluate(() => document.querySelector("#zpi-frame").contentWindow.zpiDemo.ready);
    assert.deepEqual(
      await page.evaluate(async () => {
        const w = document.querySelector("#zpi-frame").contentWindow,
          settings = (await w.zpi.getSettings()).value;
        return [
          window.zpiSite.files.list("/Users/demo/Desktop").length,
          settings.interface.fontSize,
          settings.interface.theme,
          w.localStorage.getItem("frame-only"),
          [...w.zpiDemo.useStore.getState().views.values()].flatMap((v) => v.runs).length,
          localStorage.getItem("keep-test"),
        ];
      }),
      [0, 14, "light", null, 0, "untouched"],
    );
    await diagnostics(page);
    await context.close();
    console.log(
      "PASS: arbitrary submission normalization, background generation, independent macOS Terminal and Finder share files",
    );
  }
  {
    const { page, context, z } = await pageAt();
    await send(page, "停止测试");
    await z.locator("[contenteditable=true]").first().press("Escape");
    await page.waitForTimeout(6500);
    assert.equal(await page.locator('[data-file$="/snake.html"]').count(), 0);
    await diagnostics(page);
    await context.close();
    console.log("PASS: original Escape shortcut cancels pending file writes");
  }
  {
    const { page, context, q, z } = await pageAt();
    await page.locator(".dock [data-open=quick]").click();
    await q.locator("#input").waitFor();
    assert.equal(await page.locator("#active-app").innerText(), "ZPI Quick Chat");
    const compact = await quickBounds(page);
    assert.equal(compact.width, 384);
    assert.equal(compact.height, 44);
    assert.equal(await q.locator("#pin").isVisible(), false);
    await page.screenshot({ path: path.join(artifacts, "quick-compact.png") });
    await q.locator("#input").fill("草稿保留");
    await page.locator(".apple").click();
    assert.equal(await page.locator("#quick-frame").isVisible(), false);
    await page.keyboard.press("Alt+Space");
    assert.equal(await q.locator("#input").inputValue(), "草稿保留");
    await q.locator("#web").click();
    assert.equal(await q.locator("#web").getAttribute("aria-pressed"), "true");
    await q.locator("#input").press("Enter");
    await page.waitForTimeout(300);
    const expanded = await quickBounds(page);
    assert.equal(expanded.width, compact.width + 32);
    assert.equal(expanded.height, 484);
    assert.equal(await q.locator("#tool-options").isVisible(), false);
    await q.locator("#pin").click();
    await page.locator(".apple").click();
    assert.equal(await page.locator("#quick-frame").isVisible(), true);
    await q.locator("#pin").click();
    await page.locator(".apple").click();
    assert.equal(await page.locator("#quick-frame").isVisible(), false);
    await page.keyboard.press("Alt+Space");
    await q.locator("#input").press("Escape");
    assert.equal(await page.locator("#quick-frame").isVisible(), true);
    await q.locator("#input").press("Escape");
    assert.equal(await page.locator("#quick-frame").isVisible(), false);
    await page.keyboard.press("Alt+Space");
    await page.screenshot({ path: path.join(artifacts, "quick-expanded.png") });
    await q.locator("#new").click();
    assert.equal((await quickBounds(page)).height, expanded.height);
    assert.equal(await q.locator("#pin").getAttribute("aria-pressed"), "false");
    await q.locator("#input").press("Escape");
    await page.keyboard.press("Alt+Space");
    assert.equal((await quickBounds(page)).height, 44);
    assert.equal((await quickBounds(page)).width, compact.width);
    await context.close();
    console.log(
      "PASS: original compact/expanded sizes, drafts, tools, pin, outside blur, Option+Space, Esc stop/hide and empty reset collapse",
    );
  }
  {
    const { page, context, q } = await pageAt();
    await page.locator(".dock [data-open=quick]").click();
    await q.locator("#input").waitFor();
    await page
      .locator("#quick-frame")
      .evaluate((win) => Promise.all(win.getAnimations().map((a) => a.finished)));
    const start = await quickBounds(page),
      frame = await page.locator("#quick-frame").boundingBox();
    await page.mouse.move(frame.x + 24, frame.y + 3);
    await page.mouse.down();
    await page.mouse.move(frame.x + 104, frame.y - 57, { steps: 12 });
    await page.mouse.up();
    const moved = await quickBounds(page);
    assert.equal(Math.round(moved.x - start.x), 80);
    assert.equal(Math.round(moved.y - start.y), -60);
    await q.locator("#input").fill("尺寸");
    await q.locator("#input").press("Enter");
    await page.waitForTimeout(250);
    const expanded = await quickBounds(page);
    assert.equal(expanded.x + expanded.width / 2, moved.x + moved.width / 2);
    const grip = await q.locator("[data-resize=nw]").boundingBox();
    await page.mouse.move(grip.x + 3, grip.y + 3);
    await page.mouse.down();
    await page.mouse.move(grip.x - 47, grip.y - 47, { steps: 12 });
    await page.mouse.up();
    const resized = await quickBounds(page);
    assert.equal(resized.width, expanded.width + 50);
    assert.equal(resized.height, expanded.height + 50);
    await q.locator("#input").press("Escape");
    await q.locator("#input").press("Escape");
    await page.keyboard.press("Alt+Space");
    assert.deepEqual(await quickBounds(page), resized);
    await page.keyboard.press("Alt+Shift+Space");
    assert.equal(await q.locator("#messages .message").count(), 0);
    await q.locator("#input").press("Escape");
    await page.keyboard.press("Alt+Space");
    assert.equal((await quickBounds(page)).width, resized.width - 32);
    await context.close();
    console.log(
      "PASS: native drag regions, bottom-center anchor, original resize constraints, hide/reopen preserves resized geometry",
    );
  }
  {
    const { page, context, q } = await pageAt("?app=zpi-quick-chat&autoplay=0&theme=dark");
    assert.equal(
      await q.locator("#composer").evaluate((n) => getComputedStyle(n).backgroundColor),
      "rgb(43, 43, 43)",
    );
    await assertTransparentQuickCorners(page);
    await q.locator("#input").fill("翻译");
    await q.locator("#input").press("Enter");
    await q
      .getByText(/小工具也能带来大改变/)
      .last()
      .waitFor();
    await assertTransparentQuickCorners(page);
    await page.getByRole("button", { name: "深色模式" }).click();
    assert.equal(await page.locator("#quick-frame").isVisible(), true);
    assert.equal(
      await q.locator("#composer").evaluate((n) => getComputedStyle(n).backgroundColor),
      "rgb(255, 255, 255)",
    );
    await context.close();
    console.log("PASS: Quick Chat compact and expanded dark corners match unobstructed desktop pixels");
  }
  {
    const { page, context, q } = await pageAt();
    for (const mode of ["translate", "web", "bash", "both", "missing"]) {
      if (mode === "translate") await page.locator(".dock [data-open=quick]").click();
      else await q.locator("#new").click();
      if (["both", "web"].includes(mode)) await q.locator("#web").click();
      if (["both", "bash", "missing"].includes(mode)) await q.locator("#bash").click();
      if (mode === "bash")
        await page.evaluate(() =>
          window.zpiSite.files.write("/Users/demo/Desktop/snake.html", window.ZpiSnake),
        );
      await q.locator("#input").fill("测试");
      await q.locator("#input").press("Enter");
      await page.waitForFunction(() => {
        const state = document.querySelector("#quick-frame").contentWindow.quickDemo.getState();
        return !state.busy && state.messages.at(-1)?.status === "completed";
      });
      const answer = await q.locator("#messages .assistant").innerText();
      if (mode === "translate") assert.match(answer, /小工具也能带来大改变/);
      if (mode === "web")
        assert.equal(
          await q.locator("#messages a").last().getAttribute("href"),
          "https://github.com/1316151417/zpi",
        );
      if (mode === "bash") {
        assert.match(answer, /已清理/);
        assert.equal(await page.locator('[data-file$="/snake.html"]').count(), 0);
      }
      if (mode === "both") assert.equal(await page.locator('[data-file$="/ZPI 项目卡片.md"]').count(), 1);
      if (mode === "missing") assert.match(answer, /无需清理/);
    }
    await page.locator(".dock [data-open=sdk]").click();
    assert.equal(await page.locator("#active-app").innerText(), "ZPI Agent SDK");
    assert.equal(await page.locator("#info-content").getByText(/安装/).count(), 0);
    assert.equal(
      await page.locator("#sdk-form input, #info-content p, #info-content h2, #info-content small").count(),
      0,
    );
    await page.locator("#sdk-form button").click();
    assert.match(await page.locator("#sdk-output").textContent(), /等待/);
    await page.getByText("你好，我是 zpi agent sdk。", { exact: true }).waitFor();
    await context.close();
    console.log(
      "PASS: four Quick Chat presets, actual sandbox cleanup and project card, one-second SDK greeting",
    );
  }
  {
    // A normal Playwright connection forces every tab to stay focused. Use a clean, unmodified browser.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "zpi-native-focus-"));
    const child = spawn(
      process.env.CHROMIUM_PATH || chromium.executablePath(),
      [
        "--headless=new",
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        "--user-data-dir=" + profile,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--disable-default-apps",
        "--metrics-recording-only",
        "--use-mock-keychain",
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    let focusBrowser;
    try {
      const portFile = path.join(profile, "DevToolsActivePort");
      for (let i = 0; i < 100 && !fs.existsSync(portFile); i++)
        await new Promise((resolve) => setTimeout(resolve, 100));
      const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
      focusBrowser = await chromium.connectOverCDP("http://127.0.0.1:" + port, { noDefaults: true });
      const context = focusBrowser.contexts()[0];
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1470, height: 956 });
      await page.goto(base + "/?autoplay=0");
      await page.waitForURL("**/demo.html?autoplay=0");
      await page.waitForFunction(() => Boolean(document.querySelector("#zpi-frame").contentWindow.zpiDemo));
      await page.evaluate(() => document.querySelector("#zpi-frame").contentWindow.zpiDemo.ready);
      const q = page.frameLocator("#quick-frame");
      await page.locator(".dock [data-open=quick]").click();
      await q.locator("#input").waitFor();
      const another = await context.newPage();
      await another.goto("about:blank");
      await another.bringToFront();
      await page.waitForTimeout(200);
      assert.equal(await page.locator("#quick-frame").isVisible(), false);
      await page.bringToFront();
      await page.keyboard.press("Alt+Space");
      await q.locator("#input").fill("固定");
      await q.locator("#input").press("Enter");
      await page.waitForTimeout(200);
      await q.locator("#pin").click();
      await another.bringToFront();
      await page.waitForTimeout(200);
      assert.equal(await page.locator("#quick-frame").isVisible(), true);
    } finally {
      await focusBrowser?.close();
      child.kill();
      if (child.exitCode === null && child.signalCode === null)
        await new Promise((resolve) => child.once("exit", resolve));
      fs.rmSync(profile, { recursive: true, force: true });
    }
    console.log("PASS: real browser focus loss hides unpinned Quick Chat and retains pinned windows");
  }
  {
    const { page, context, z } = await pageAt();
    await send(page, "第一轮");
    await complete(page);
    await send(page, "第二轮");
    await complete(page);
    await z.locator(".context-circle").waitFor();
    await z.locator(".context-circle").hover();
    await z.getByText("上下文容量", { exact: true }).first().waitFor();
    await z
      .locator(".assistant-message-actions")
      .first()
      .getByRole("button", { name: "分叉", exact: true })
      .click({ force: true });
    await z.locator(".topbar-title").filter({ hasText: "Fork of 演示任务" }).waitFor();
    const history = () =>
      page.evaluate(() => {
        const s = document.querySelector("#zpi-frame").contentWindow.zpiDemo.useStore.getState();
        return s.views.get(s.selected).runs.length;
      });
    assert.equal(await history(), 1);
    await send(page, "fork 测试");
    await complete(page);
    assert.equal(await history(), 2);
    assert.equal(await z.locator(".topbar-title").innerText(), "Fork of 演示任务");
    const checks = await page.evaluate(async () => {
      const w = document.querySelector("#zpi-frame").contentWindow;
      const api = w.zpi;
      const initial = (await api.listTools()).value.filter((t) => t.enabled).length;
      await api.saveWebSearch({ provider: "deepseek", enabled: true });
      const withWeb = (await api.listTools()).value.filter((t) => t.enabled).length;
      await api.setPluginEnabled("zpi.web-search", false);
      const webOff = (await api.listTools()).value.filter(
        (t) => t.name.startsWith("web_") && !t.enabled,
      ).length;
      await api.setPluginEnabled("zpi.collaboration", false);
      await api.setPluginEnabled("zpi.background-tasks", false);
      const tools = (await api.listTools()).value;
      return [
        initial,
        withWeb,
        webOff,
        ...tools
          .filter((t) => ["Agent", "SendMessage", "TaskOutput", "TaskStop"].includes(t.name))
          .map((t) => t.enabled),
      ];
    });
    assert.deepEqual(checks, [9, 11, 2, false, false, false, false]);
    const copied = await page.evaluate(() => {
      const w = document.querySelector("#zpi-frame").contentWindow,
        d = w.document,
        body = d.createElement("div");
      body.className = "markdown-body";
      body.innerHTML = "<p>第一行</p><p>第二行</p><pre>a\n\nb</pre>";
      d.body.append(body);
      const range = d.createRange();
      range.selectNodeContents(body);
      const sel = w.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const data = new w.DataTransfer();
      body.dispatchEvent(
        new w.ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }),
      );
      body.remove();
      return data.getData("text/plain");
    });
    assert.equal(copied, "第一行\n第二行\na\n\nb");
    await context.close();
    console.log(
      "PASS: context meter, historical fork cutoff and continued playback, plugin gating, exact Markdown selection newlines",
    );
  }
  {
    const startup = await browser.newContext();
    await startup.addInitScript(() => {
      if (window !== window.top) return;
      new MutationObserver(() => {
        const windows = [...document.querySelectorAll("#zpi-native-window,#quick-frame,#info-window")];
        if (windows.length !== 3 || !document.querySelector(".dock")) return;
        const visible = windows.find((win) => !win.hidden);
        if (!visible) window.emptyDesktopAt ??= performance.now();
        else window.firstWindowAt ??= performance.now();
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    });
    for (const [app, selector] of [
      ["zpi", "#zpi-native-window"],
      ["zpi-quick-chat", "#quick-frame"],
      ["zpi-agent-sdk", "#info-window"],
    ]) {
      const page = await startup.newPage();
      await page.goto(`${base}/demo.html?app=${app}&autoplay=0`);
      await page.locator(selector).waitFor();
      const gap = await page.evaluate(() => window.firstWindowAt - window.emptyDesktopAt);
      assert.ok(gap >= 990, `${app} showed after ${gap} ms`);
      await page.close();
    }
    const takeover = await startup.newPage();
    await takeover.goto(`${base}/demo.html?app=zpi-agent-sdk&autoplay=1`, { waitUntil: "domcontentloaded" });
    await takeover.waitForFunction(() => window.zpiSite);
    await takeover.locator(".dock [data-action=files]").click();
    await takeover.waitForTimeout(1250);
    assert.equal(await takeover.locator("#active-app").textContent(), "访达");
    assert.equal(await takeover.locator("#info-window").isHidden(), true);
    await startup.close();
    console.log("PASS: all three apps start on an empty desktop for one second; Dock interaction takes over");
    for (const product of ["zpi-quick-chat", "zpi-agent-sdk"]) {
      const { page, context, q } = await pageAt("?app=" + product + "&autoplay=1");
      assert.equal(await page.locator("#zpi-native-window").isVisible(), false);
      if (product === "zpi-quick-chat") {
        await q.getByText("小工具也能带来大改变。", { exact: false }).last().waitFor();
        assert.equal(await page.locator("#notice").isHidden(), true);
      } else {
        await page.getByText("你好，我是 zpi agent sdk。", { exact: true }).waitFor();
        for (const viewport of [
          { width: 894, height: 612 },
          { width: 375, height: 540 },
        ]) {
          await page.setViewportSize(viewport);
          await page.locator("#sdk-form button").click();
          await page.getByText("你好，我是 zpi agent sdk。", { exact: true }).waitFor();
          const rect = (sel) => page.locator(sel).boundingBox();
          const [reply, body, win, dock] = await Promise.all(
            ["#sdk-output", "#info-content", "#info-window", ".dock"].map(rect),
          );
          assert.ok(reply.y >= body.y - 1 && reply.y + reply.height <= body.y + body.height + 1);
          assert.ok(win.y + win.height <= dock.y);
        }
      }
      await context.close();
    }
    const { page, context } = await pageAt("?app=all&autoplay=1");
    await page.evaluate(() => {
      window.tourTimes = {};
      for (const id of ["zpi-native-window", "quick-frame", "info-window"]) {
        const win = document.getElementById(id);
        new MutationObserver(() => {
          window.tourTimes[id + (win.hidden ? ":closed" : ":opened")] = performance.now();
        }).observe(win, { attributes: true, attributeFilter: ["hidden"] });
      }
    });
    await complete(page);
    await page.locator("#quick-frame").waitFor();
    assert.equal(await page.locator("#zpi-native-window").isVisible(), false);
    await page.getByText("你好，我是 zpi agent sdk。", { exact: true }).waitFor({ timeout: 18000 });
    assert.equal(await page.locator("#quick-frame").isVisible(), false);
    await page.locator("#info-window").waitFor({ state: "hidden" });
    const times = await page.evaluate(() => window.tourTimes);
    assert.ok(times["quick-frame:opened"] - times["zpi-native-window:closed"] >= 2990);
    assert.ok(times["info-window:opened"] - times["quick-frame:closed"] >= 2990);
    await context.close();
    const paused = await pageAt("?app=zpi-agent-sdk&autoplay=0");
    await paused.page.waitForTimeout(1800);
    assert.equal(await paused.page.locator("#sdk-output").innerText(), "等待运行");
    await paused.context.close();
    const interrupted = await pageAt("?app=all&autoplay=1");
    await interrupted.page.locator(".dock [data-open=sdk]").click();
    await interrupted.page.waitForTimeout(3300);
    assert.equal(await interrupted.page.locator("#active-app").innerText(), "ZPI Agent SDK");
    assert.equal(await interrupted.page.locator("#sdk-output").innerText(), "等待运行");
    await interrupted.context.close();
    console.log("PASS: direct URLs, no-autoplay, sequential playback and user takeover");
  }
  {
    const products = ["zpi", "zpi-quick-chat", "zpi-agent-sdk"];
    const host = require("node:http").createServer((req, res) =>
      res
        .writeHead(200, { "Content-Type": "text/html" })
        .end(
          req.url === "/below"
            ? `<button autofocus>继续阅读</button><div style="height:140vh"></div><script>window.scrolled=false;addEventListener('scroll',()=>window.scrolled=true)</script><iframe width="860" height="510" title="quick" src="${base}/demo.html?app=zpi-quick-chat&autoplay=1"></iframe>`
            : `<main style="display:flex">${products.map((p) => `<iframe style="width:33%;height:640px" title="${p}" src="${base}/demo.html?app=${p}&autoplay=1"></iframe>`).join("")}</main>`,
        ),
    );
    await new Promise((resolve) => host.listen(0, "127.0.0.1", resolve));
    const context = await browser.newContext({ viewport: { width: 1500, height: 850 } });
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${host.address().port}/`);
      const one = page.frameLocator("iframe[title=zpi]"),
        two = page.frameLocator("iframe[title=zpi-quick-chat]"),
        three = page.frameLocator("iframe[title=zpi-agent-sdk]");
      await one.locator('[data-file$="/snake.html"]').waitFor({ timeout: 25000 });
      await two
        .frameLocator("#quick-frame")
        .getByText(/小工具也能带来大改变/)
        .last()
        .waitFor();
      await three.getByText("你好，我是 zpi agent sdk。", { exact: true }).waitFor();
      assert.equal(await two.locator("#quick-frame").isVisible(), true);
      assert.equal(await two.locator('[data-file$="/snake.html"]').count(), 0);
      assert.equal(await three.locator('[data-file$="/snake.html"]').count(), 0);
      await page.goto(`http://127.0.0.1:${host.address().port}/below`);
      const desk = page.frameLocator("iframe[title=quick]");
      const chat = desk.frameLocator("#quick-frame");
      await chat
        .getByText(/小工具也能带来大改变/)
        .last()
        .waitFor();
      assert.deepEqual(
        await page.evaluate(() => [window.scrolled, scrollY, document.activeElement.tagName]),
        [false, 0, "BUTTON"],
      );
      await chat.locator("#input").click();
      assert.ok(await chat.locator("#input").evaluate((n) => n === n.ownerDocument.activeElement));
      await desk.locator(".dock [data-open=zpi]").click();
      await desk.frameLocator("#zpi-frame").locator(".shell.mac-desktop main.main").waitFor();
    } finally {
      await context.close();
      host.close();
    }
    console.log(
      "PASS: three real cross-origin sibling embeds autoplay with isolated files and visible results",
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  console.log("All source UI integration checks passed. Screenshots: " + artifacts);
})()
  .catch((error) => {
    console.error(error);
    if (errors.length) console.error(errors);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.kill();
  });
