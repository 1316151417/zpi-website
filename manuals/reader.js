// Optional enhancements. All articles, search listings and anchor navigation work without JS.
(() => {
  const search = document.querySelector(".search-link");
  const input = document.querySelector("#find-input");
  const bookSelect = document.querySelector("#find-book");
  if (input) {
    const terms = new URLSearchParams(location.search);
    input.value = terms.get("q") || "";
    bookSelect.value = [...bookSelect.options].some((o) => o.value === terms.get("book"))
      ? terms.get("book")
      : "";
    const lists = [...document.querySelectorAll("[data-search-book]")];
    function filter() {
      const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let count = 0;
      for (const list of lists) {
        let matches = 0;
        for (const item of list.querySelectorAll("li")) {
          const visible =
            (!bookSelect.value || list.dataset.searchBook === bookSelect.value) &&
            words.every((w) => item.dataset.terms.includes(w));
          item.hidden = !visible;
          matches += Number(visible);
        }
        list.hidden = !matches;
        count += matches;
      }
      document.querySelector("#find-count").textContent = count
        ? `找到 ${count} 项`
        : "没有匹配结果。试试方法名、参数名或更短的中文关键词。";
    }
    document.querySelector(".find-controls").hidden = false;
    input.addEventListener("input", filter);
    bookSelect.addEventListener("change", filter);
    filter();
    if (terms.has("focus")) input.focus();
  }
  if (search) {
    document.addEventListener("keydown", (e) => {
      if (!e.isComposing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (input) input.focus();
        else {
          const u = new URL(search.href);
          u.searchParams.set("focus", "1");
          location.assign(u);
        }
      }
    });
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) search.querySelector("kbd").textContent = "Ctrl K";
  }
  const copy = document.querySelector(".copy-page"),
    article = document.querySelector("main article");
  if (copy && article) {
    copy.hidden = false;
    copy.addEventListener("click", async () => {
      let ok = false;
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(article.innerText);
          ok = true;
        }
      } catch {}
      if (!ok) {
        const range = document.createRange();
        range.selectNodeContents(article);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(range);
        try {
          ok = document.execCommand("copy");
        } catch {}
        if (ok) s.removeAllRanges();
      }
      copy.querySelector("span").textContent = ok ? "已复制" : "已选中，请复制";
    });
  }
  const rail = document.querySelector(".book-nav");
  const current = rail?.querySelector("[aria-current]");
  if (rail && current && rail.clientHeight) {
    const r = rail.getBoundingClientRect(),
      c = current.getBoundingClientRect();
    if (c.bottom > r.bottom) rail.scrollTop += c.top - r.top - rail.clientHeight / 3;
  }
  const toc = document.querySelector(".toc");
  if (toc && "IntersectionObserver" in window) {
    const pairs = [...toc.querySelectorAll("a")]
      .map((a) => [a, document.getElementById(decodeURIComponent(a.hash.slice(1)))])
      .filter(([, h]) => h);
    if (pairs.length) {
      const update = () => {
        const top = parseFloat(getComputedStyle(toc).top) || 0;
        const active = pairs.filter(([, h]) => h.getBoundingClientRect().top <= top + 16).at(-1) ?? pairs[0];
        for (const [a] of pairs) {
          if (a === active[0]) a.setAttribute("aria-current", "location");
          else a.removeAttribute("aria-current");
        }
      };
      const observer = new IntersectionObserver(update, { rootMargin: "-12% 0px -64% 0px" });
      for (const [, h] of pairs) observer.observe(h);
      update();
    }
  }
})();
