import assert from "node:assert/strict";

const toggle = (page) => page.getByRole("button", { name: "深色模式", exact: true });
async function expectTheme(page, value) {
  await page.locator(`html[data-site-theme="${value}"]`).waitFor({ state: "attached" });
  const button = toggle(page);
  await button.waitFor();
  assert.equal(await button.getAttribute("aria-pressed"), String(value === "dark"));
  assert.equal(await button.getAttribute("title"), value === "dark" ? "切换到浅色模式" : "切换到深色模式");
  assert.equal(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme), value);
}

export async function checkTheme(page, home) {
  const at = (path) => new URL(path, home).href;
  await page.goto(home);
  await expectTheme(page, "light");
  await page.locator("#manual-link").click();
  await expectTheme(page, "light");
  await toggle(page).press("Enter");
  await expectTheme(page, "dark");
  await page.reload();
  await expectTheme(page, "dark");
  await page.goBack();
  await expectTheme(page, "dark");

  const second = await page.context().newPage();
  try {
    await second.goto(at("manuals/zpi-agent-sdk/start/first.html"));
    await expectTheme(second, "dark");
    const token = second.locator(".listing code span").first();
    const color = (el) => getComputedStyle(el).color;
    const darkCode = await token.evaluate(color);
    await toggle(page).click();
    await expectTheme(second, "light");
    assert.notEqual(await token.evaluate(color), darkCode);
    await toggle(second).click();
    await expectTheme(page, "dark");
    const desktop = page.frameLocator("#live");
    await desktop.locator('html[data-site-theme="dark"]').waitFor({ state: "attached" });
    await desktop.frameLocator("#zpi-frame").locator('html[data-theme="dark"]').waitFor();
    assert.ok(await desktop.locator("[data-theme-switch]").isHidden());
    await second.locator(".search-link").click();
    await expectTheme(second, "dark");
    await second.locator(".home-link").click();
    await expectTheme(second, "dark");

    await second.goto(at("manuals/zpi-quick-chat/index.html?theme=dark"));
    await expectTheme(second, "dark");
    assert.equal(second.url(), at("manuals/zpi-quick-chat/index.html"));
    await second.locator(".home-link").click();
    await toggle(second).click();
    await second.goBack();
    await expectTheme(second, "light");

    await second.goto(at("demo.html?app=zpi-agent-sdk&autoplay=0&theme=dark#preview"));
    await expectTheme(second, "dark");
    await toggle(second).click();
    assert.equal(second.url(), at("demo.html?app=zpi-agent-sdk&autoplay=0#preview"));
    await second.reload();
    await expectTheme(second, "light");
    await expectTheme(page, "light");
  } finally { await second.close(); }
}
