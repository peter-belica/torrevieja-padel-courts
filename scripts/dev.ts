// Lokálny server: statické súbory z public/ a /api/<zdroj> ako na Verceli (bez CDN cache).
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { calendarHandler } from "../lib/handler.js";
import { SOURCES } from "../lib/sources/index.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.warn("Bez .env.local — NovaPadel sa nepripojí.");
}

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_DIR = join(import.meta.dirname, "..", "public");
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};
const handlers = Object.fromEntries(Object.entries(SOURCES).map(([name, load]) => [name, calendarHandler(load)]));

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const api = url.pathname.match(/^\/api\/(\w+)$/);
  if (api) {
    const handler = handlers[api[1]];
    if (!handler) return void res.writeHead(404).end();
    const response = await handler(new Request(url));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return void res.end(await response.text());
  }

  const file = normalize(join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(PUBLIC_DIR)) return void res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
