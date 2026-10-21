import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4"
};

const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const resolved = normalize(join(root, relative));
    if (!resolved.startsWith(root)) throw new Error("Invalid path");
    const info = await stat(resolved);
    const path = info.isDirectory() ? join(resolved, "index.html") : resolved;
    const fileInfo = info.isDirectory() ? await stat(path) : info;
    const headers = {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Content-Length": fileInfo.size,
      "Accept-Ranges": "bytes"
    };
    let start = 0, end = fileInfo.size - 1, status = 200;
    if (request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (range && (range[1] || range[2])) {
        start = range[1] ? Number(range[1]) : Math.max(0, fileInfo.size - Number(range[2]));
        end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
      } else start = NaN;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= fileInfo.size) {
        response.writeHead(416, { "Content-Range": `bytes */${fileInfo.size}`, "Content-Length": 0 });
        response.end();
        return;
      }
      status = 206;
      headers["Content-Range"] = `bytes ${start}-${end}/${fileInfo.size}`;
      headers["Content-Length"] = end - start + 1;
    }
    response.writeHead(status, headers);
    if (request.method === "HEAD" || fileInfo.size === 0) response.end();
    else {
      const stream = createReadStream(path, { start, end });
      stream.on("error", () => response.destroy());
      response.on("close", () => stream.destroy());
      stream.pipe(response);
    }
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Volley Record is running at http://127.0.0.1:${port}`);
});
