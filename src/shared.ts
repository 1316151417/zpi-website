import "../js/core.js";
import "../js/snake.js";

export const core = (globalThis as any).ZpiCore;
export const snake = (globalThis as any).ZpiSnake as string;
export const DESKTOP = core.DESKTOP as string;
export const PROMPT = core.PROMPT as string;
export const files = site()?.files ?? new core.FileSystem();
export type FileChange = { paths: string[]; entriesChanged: boolean };
export const clone = <T>(value: T): T => structuredClone(value);
// On public HTTP the original renderers still need UUIDs, but only getRandomValues is available.
if (typeof crypto.randomUUID !== "function") {
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}
export const id = (prefix: string) => prefix + "-" + crypto.randomUUID();
export function site() {
  // The desktop itself may be embedded on a different origin.
  try {
    return (window.parent as any).zpiSite;
  } catch {
    return undefined;
  }
}
export function onTrustedInput(callback: () => void) {
  for (const name of ["pointerdown", "keydown", "input"])
    document.addEventListener(
      name,
      (event) => {
        if (event.isTrusted) callback();
      },
      true,
    );
}
export const previewSandbox = "allow-scripts";
export function previewSrcdoc(html: string) {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">${html}`;
}
export function openStandalone(path: string) {
  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const html = `<!doctype html><meta charset="utf-8"><title>${escape(core.basename(path))}</title><iframe title="HTML 预览" sandbox="${previewSandbox}" style="position:fixed;inset:0;width:100%;height:100%;border:0" srcdoc="${escape(previewSrcdoc(files.read(path)))}"></iframe>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function clipboard(text: string) {
  text = text.replace(/\r\n?/g, "\n");
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const node = document.createElement("textarea");
  node.value = text;
  document.body.append(node);
  node.select();
  const copied = document.execCommand("copy");
  node.remove();
  if (!copied) throw new Error("浏览器不允许复制，请手动选择文字。");
}
