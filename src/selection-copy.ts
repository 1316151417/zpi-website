// Chromium inserts a second layout newline between selected paragraph elements.
// Serialize only the selected Markdown fragment. Code, explicit breaks and source-copy buttons stay verbatim.
export function installSelectionCopy(scope: string) {
  document.addEventListener("copy", (event) => {
    const sel = window.getSelection();
    if (event.defaultPrevented || !event.clipboardData || !sel || sel.isCollapsed || !sel.rangeCount) return;
    const region = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest(scope);
    const area = region(sel.anchorNode);
    if (!area || area !== region(sel.focusNode)) return;
    const fragment = sel.getRangeAt(0).cloneContents();
    if (!fragment.querySelector("p,h1,h2,h3,h4,li,blockquote")) return;
    function serialize(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (node instanceof Element) {
        if (node.tagName === "BR") return "\n";
        if (node.tagName === "PRE") return node.textContent ?? "";
        if (node.matches("button,[aria-hidden=true]")) return "";
      }
      let result = "",
        afterBlock = false;
      for (const child of node.childNodes) {
        const block =
          child instanceof Element && child.matches("p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre");
        const value = serialize(child);
        if (afterBlock && child.nodeType === Node.TEXT_NODE && !value.trim()) continue;
        if (result && (block || afterBlock) && !result.endsWith("\n")) result += "\n";
        result += value;
        afterBlock = block;
      }
      return result;
    }
    event.clipboardData.setData("text/plain", serialize(fragment));
    event.preventDefault();
  });
}
