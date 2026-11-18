export type DemoApp = "zpi" | "zpi-quick-chat" | "zpi-agent-sdk";
export const sequence: DemoApp[] = ["zpi", "zpi-quick-chat", "zpi-agent-sdk"];
export function requestedApp(url: URL): DemoApp | "all" {
  const requested = url.searchParams.get("app") ?? url.hash.slice(1);
  if (requested === "all") return "all";
  if (requested === "quick-chat" || requested === "zpi-quick-chat") return "zpi-quick-chat";
  if (requested === "agent-sdk" || requested === "zpi-agent-sdk") return "zpi-agent-sdk";
  return "zpi";
}
export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function waitUntil(test: () => boolean, signal: AbortSignal, timeout = 20000) {
  const until = Date.now() + timeout;
  while (!test()) {
    if (Date.now() > until) throw Error("演示未能就绪");
    await delay(60, signal);
  }
  signal.throwIfAborted();
}
