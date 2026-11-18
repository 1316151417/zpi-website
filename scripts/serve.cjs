const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.env.STATIC_ROOT || path.resolve(__dirname, "../dist"));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
http
  .createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
      const relative = path.relative(root, file);
      if (
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        relative.split(path.sep).some((part) => part.startsWith(".") || part === "node_modules")
      ) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405).end("Method not allowed");
        return;
      }
      const stat = fs.statSync(file);
      if (!stat.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      if (request.method === "HEAD") response.end();
      else fs.createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`ZPI playground: http://127.0.0.1:${port}`));
