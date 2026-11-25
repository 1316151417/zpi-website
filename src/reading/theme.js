// Runs in <head> on every site page, before styles and before any product renderer starts.
(() => {
  const key = "zpi-website:theme";
  const root = document.documentElement;
  const valid = (value) => value === "light" || value === "dark";
  const current = () => root.dataset.siteTheme === "dark" ? "dark" : "light";
  let owner, store, button;
  try {
    if (window.frameElement?.hasAttribute("data-theme-frame")) owner = window.parent.zpiAppearance;
    if (window === window.top) store = window.localStorage;
  } catch { /* Unrelated embeds and storage-restricted contexts stay independent. */ }

  function saved() {
    try {
      const value = store?.getItem(key);
      return valid(value) ? value : "light";
    } catch {
      store = undefined;
      return "light";
    }
  }
  function remember(value) {
    try { store?.setItem(key, value); } catch { store = undefined; }
  }
  function consumeHint(value) {
    const url = new URL(location.href);
    const hint = url.searchParams.get("theme");
    if (!valid(hint)) return;
    // A bookmark can set the initial theme, but Back must not replay it over a newer choice.
    if (store) url.searchParams.delete("theme");
    else if (hint !== value) url.searchParams.set("theme", value);
    else return;
    try { history.replaceState(history.state, "", url); } catch { /* Opaque embeds cannot rewrite URLs. */ }
  }

  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>';
  const moon = '<path d="M20.4 14.3a8.6 8.6 0 0 1-10.7-10.7 8.7 8.7 0 1 0 10.7 10.7Z"/>';
  function syncButton() {
    if (!button) return;
    const dark = current() === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.title = dark ? "切换到浅色模式" : "切换到深色模式";
    button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dark ? sun : moon}</svg>`;
  }
  function apply(value) {
    if (!valid(value) || root.dataset.siteTheme === value) return;
    root.dataset.siteTheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "dark" ? "#191b1f" : "#ffffff");
    syncButton();
    window.dispatchEvent(new Event("zpi-theme-change"));
    for (const frame of document.querySelectorAll("iframe[data-theme-frame]")) {
      try { frame.contentWindow?.zpiAppearance?.apply(value); } catch { /* The frame may have navigated off-site. */ }
    }
  }
  function select(value) {
    if (!valid(value)) return;
    if (owner) return owner.select(value);
    remember(value);
    consumeHint(value);
    apply(value);
  }
  function restore() {
    if (owner) return apply(owner.current());
    if (store) apply(saved());
  }

  window.zpiAppearance = { current, select, apply };
  const hint = new URLSearchParams(location.search).get("theme");
  if (!owner && valid(hint)) select(hint);
  else apply(owner?.current() ?? saved());

  window.addEventListener("storage", (event) => {
    if (store && event.storageArea === store && (event.key === key || event.key === null)) restore();
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) restore(); });
  document.addEventListener("DOMContentLoaded", () => {
    if (owner) return; // The parent already provides the control for its embedded desktop.
    button = document.querySelector("[data-theme-switch]");
    if (!button) return;
    button.setAttribute("aria-label", "深色模式");
    syncButton();
    button.hidden = false;
    // A mouse click must not steal focus from an unpinned Quick Chat window.
    button.onpointerdown = (event) => { if (event.button === 0) event.preventDefault(); };
    button.onclick = () => select(current() === "dark" ? "light" : "dark");
  }, { once: true });
})();
