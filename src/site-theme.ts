export type SiteTheme = "light" | "dark";
type Appearance = {
  current: () => SiteTheme;
  apply: (value: SiteTheme) => void;
  select: (value: SiteTheme) => void;
};
declare global {
  interface Window {
    zpiAppearance?: Appearance;
  }
}

// Only the website's own marked frames inherit its theme. A third-party embedding page owns no settings here.
function parentAppearance() {
  try {
    return window.frameElement?.hasAttribute("data-theme-frame") ? window.parent.zpiAppearance : undefined;
  } catch {
    return undefined;
  }
}
export const currentTheme = (): SiteTheme =>
  document.documentElement.dataset.siteTheme === "dark" ? "dark" : "light";
function apply(value: SiteTheme) {
  const root = document.documentElement;
  if (root.dataset.siteTheme === value) return;
  root.dataset.siteTheme = value;
  const button = document.querySelector<HTMLButtonElement>("[data-theme-switch]");
  if (button) {
    button.setAttribute("aria-pressed", String(value === "dark"));
    button.title = value === "dark" ? "切换到浅色" : "切换到深色";
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", value === "dark" ? "#192c35" : "#fafbfc");
  window.dispatchEvent(new Event("zpi-theme-change"));
  for (const frame of document.querySelectorAll<HTMLIFrameElement>("iframe[data-theme-frame]"))
    frame.contentWindow?.zpiAppearance?.apply(value);
}
function select(value: SiteTheme) {
  const parent = parentAppearance();
  if (parent) parent.select(value);
  else apply(value);
}
window.zpiAppearance = { current: currentTheme, select, apply };
apply(
  parentAppearance()?.current() ??
    (new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light"),
);
const button = document.querySelector<HTMLButtonElement>("[data-theme-switch]");
if (button) {
  button.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/></svg>';
  // A pointer theme change should not steal focus from an unpinned Quick Chat window.
  button.onpointerdown = (event) => {
    if (event.button === 0) event.preventDefault();
  };
  button.onclick = () => select(currentTheme() === "dark" ? "light" : "dark");
  // The parent homepage already has this control. Keep it in the menu bar on standalone and other embeds.
  if (parentAppearance()) button.hidden = true;
}
