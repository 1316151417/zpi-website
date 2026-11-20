import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { buildManuals } from "./manuals.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const zpi = resolve(process.env.ZPI_SOURCE || resolve(root, "../zpi"));
const quick = resolve(process.env.QUICK_CHAT_SOURCE || resolve(root, "../zpi-quick-chat"));
const requireZpi = createRequire(resolve(zpi, "package.json"));
const { build, createServer } = await import(pathToFileURL(requireZpi.resolve("vite")).href);
const tailwind = (await import(pathToFileURL(requireZpi.resolve("@tailwindcss/vite")).href)).default;

// Vite copies public/ wholesale, including stale files from previous builds.
await rm(resolve(root, "public/backup"), { recursive: true, force: true });
await mkdir(resolve(root, "public"), { recursive: true });
await cp(resolve(zpi, "packages/desktop/src/renderer/public"), resolve(root, "public"), { recursive: true });
const assets = Promise.all([
  cp(resolve(zpi, "icon.png"), resolve(root, "public/zpi-icon.png")),
  ...["cmaps", "standard_fonts", "wasm"].map((dir) =>
    cp(resolve(zpi, "node_modules/pdfjs-dist", dir), resolve(root, "public/pdfjs", dir), { recursive: true }),
  ),
]);
async function writeIfChanged(path, content) {
  const previous = await readFile(path, "utf8").catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
  if (previous !== content) await writeFile(path, content);
}
const revision = (dir) => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};
const sourceFiles = {
  "zpi/App.tsx": resolve(zpi, "packages/desktop/src/renderer/App.tsx"),
  "zpi/SettingsPage.tsx": resolve(zpi, "packages/desktop/src/renderer/SettingsPage.tsx"),
  "zpi/workbench.css": resolve(zpi, "packages/desktop/src/renderer/workbench.css"),
  "zpi/ui/styles.css": resolve(zpi, "packages/ui/src/styles.css"),
  "quick/index.html": resolve(quick, "src/index.html"),
  "quick/renderer.ts": resolve(quick, "src/renderer.ts"),
  "quick/style.css": resolve(quick, "src/style.css"),
  "quick/window.ts": resolve(quick, "src/window.ts"),
};
const readSources = Promise.all(
  Object.entries(sourceFiles).map(async ([name, path]) => [name, await readFile(path)]),
);
const readVersion = async (dir) => ({
  version: JSON.parse(await readFile(resolve(dir, "package.json"), "utf8")).version,
  revision: revision(dir),
});
const [sources, zpiVersion, quickVersion] = await Promise.all([
  readSources,
  readVersion(zpi),
  readVersion(quick),
  assets,
]);
const sourceHashes = Object.fromEntries(
  sources.map(([name, source]) => [name, createHash("sha256").update(source).digest("hex")]),
);
const quickHtml = Object.fromEntries(sources)
  ["quick/index.html"].toString("utf8")
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, "")
  .replace("<title>Quick Chat</title>", "<title>ZPI Quick Chat</title>")
  .replace(/(<textarea\b[^>]*?) autofocus\b/, "$1")
  .replace('<link rel="stylesheet" href="./style.css">', "")
  .replace('src="./renderer.js"', 'src="/src/quick-entry.ts"');
await Promise.all([
  writeIfChanged(resolve(root, "quick.html"), quickHtml),
  writeIfChanged(
    resolve(root, "public/source-versions.json"),
    JSON.stringify(
      {
        sourceHashes,
        zpi: zpiVersion,
        quickChat: quickVersion,
        integration:
          "Original renderer sources and styles; browser-only native bridge adapters. No product UI copies or theme overrides.",
      },
      null,
      2,
    ),
  ),
]);

const toolMetadata = execFileSync(
  process.execPath,
  [
    "--conditions=development",
    "--import",
    requireZpi.resolve("tsx"),
    resolve(root, "scripts/tool-catalog.mjs"),
  ],
  { cwd: zpi, encoding: "utf8" },
);
const config = {
  configFile: false,
  root,
  base: "./",
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: "quick-chat-site-theme",
          AtRule: {
            media(rule) {
              if (
                rule.source?.input.file !== resolve(quick, "src/style.css") ||
                rule.params !== "(prefers-color-scheme: dark)"
              )
                return;
              // Keep Quick Chat's own dark palette; the browser host supplies the theme instead of Electron's OS setting.
              rule.walkRules((child) => {
                child.selectors = child.selectors.map((s) =>
                  s.startsWith(":root")
                    ? `:root[data-site-theme="dark"]${s.slice(5)}`
                    : `:root[data-site-theme="dark"] ${s}`,
                );
              });
              rule.replaceWith(...rule.nodes);
            },
          },
        },
      ],
    },
  },
  plugins: [
    tailwind(),
    {
      name: "tool-catalog",
      resolveId(id) {
        if (id === "virtual:demo-tools") return "\0demo-tools";
      },
      load(id) {
        if (id === "\0demo-tools") return `export default ${toolMetadata}`;
      },
    },
  ],
  resolve: {
    alias: {
      "@source/ai": resolve(zpi, "packages/ai/src"),
      "@source/desktop": resolve(zpi, "packages/desktop/src"),
      "@source/ui": resolve(zpi, "packages/ui/src"),
      "@source/plugins": resolve(zpi, "packages/builtin-plugins/src"),
      "@source/quick": resolve(quick, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: { include: [], exclude: ["@source/desktop", "@source/quick"] },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT || 4173),
    strictPort: true,
    fs: { allow: [root, zpi, quick] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rolldownOptions: {
      input: {
        index: resolve(root, "index.html"),
        demo: resolve(root, "demo.html"),
        zpi: resolve(root, "zpi.html"),
        quick: resolve(root, "quick.html"),
      },
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
  worker: {
    format: "es",
    plugins: () => [
      {
        name: "original-diff-worker",
        enforce: "pre",
        async resolveId(source, importer) {
          if (source !== "@pierre/diffs/worker/worker.js") return;
          const resolved = await this.resolve(source, importer, { skipSelf: true });
          return resolved ? { ...resolved, moduleSideEffects: true } : undefined;
        },
      },
    ],
  },
};
// Resolve shared React from the original workspace, not a second website copy.
config.resolve.alias.react = dirname(requireZpi.resolve("react/package.json"));
config.resolve.alias["react-dom"] = dirname(requireZpi.resolve("react-dom/package.json"));
await buildManuals(quick);
if (process.argv.includes("build")) await build(config);
else {
  const server = await createServer(config);
  await server.listen();
  server.printUrls();
}
