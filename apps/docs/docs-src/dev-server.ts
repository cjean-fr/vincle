import config from "../docs.config.js";
import {
  initBuild,
  rebuildAll,
  rebuildPages,
  refreshPages,
  getAllPages,
} from "./lib/build-engine.js";
import { serve } from "bun";
import type { ServerWebSocket } from "bun";
import { watch } from "node:fs";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, extname, relative, resolve } from "node:path";

const PORT = Number(process.env["PORT"] ?? 3000);
const APP_ROOT = resolve(import.meta.dirname!, "..");
const DIST = join(APP_ROOT, "dist");

let watcher: ReturnType<typeof watch>;

const clients = new Set<ServerWebSocket<undefined>>();

function injectLiveReload(html: string): string {
  const script = `<script>
(function(){var ws=new WebSocket("ws://"+location.host+"/__hmr");
ws.onmessage=function(e){if(e.data==="reload")location.reload()};
ws.onclose=function(){setTimeout(function(){location.reload()},1000)}})()
</script>`;
  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html;
  return html.slice(0, idx) + script + "\n" + html.slice(idx);
}

const watcherExtensions = new Set(Object.keys(config.handlers));
const pagesDir = resolve(config.pages);
const configFile = resolve(APP_ROOT, "docs.config.ts");

function isPageFile(filePath: string): boolean {
  return (
    filePath.startsWith(pagesDir) && watcherExtensions.has(extname(filePath))
  );
}

function fileToUrl(filePath: string): string | null {
  if (!filePath.startsWith(pagesDir)) return null;
  const rel = relative(pagesDir, filePath);
  let route = rel.replace(extname(rel), "");
  if (route.endsWith("/index")) route = route.slice(0, -6);
  if (route === "index") route = "";
  return "/" + route;
}

function notifyClients(): void {
  for (const ws of clients) {
    try {
      ws.send("reload");
    } catch {
      clients.delete(ws);
    }
  }
}

let rebuilding = false;

async function onSourceChange(filePath: string): Promise<void> {
  if (
    filePath.includes("node_modules") ||
    filePath.includes("/dist/") ||
    filePath.includes("/.git/") ||
    filePath.includes(".compiled")
  )
    return;
  if (rebuilding) return;

  rebuilding = true;
  try {
    if (filePath === configFile) {
      console.log("[dev] Config changed, full rebuild...");
      watcher.close();
      process.exit(0); // Restart required for config changes
    }

    if (isPageFile(filePath)) {
      const url = fileToUrl(filePath);
      if (url) {
        const known = getAllPages().find((p) => p.url === url);
        if (known) {
          await rebuildPages([url]);
        } else {
          await refreshPages();
        }
        notifyClients();
        return;
      }
    }

    // Fallback: full page refresh for layout/component changes
    await refreshPages();
    notifyClients();
  } finally {
    rebuilding = false;
  }
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function cleanup(watcher: ReturnType<typeof watch>): void {
  watcher.close();
}

async function main(): Promise<void> {
  await initBuild();
  const initialOk = await rebuildAll()
    .then(() => true)
    .catch((e) => {
      console.error("[dev] rebuildAll failed:", e);
      return false;
    });
  if (!initialOk) process.exit(1);
  console.log(`[dev] Serving http://localhost:${PORT}`);

  watcher = watch(APP_ROOT, { recursive: true }, (_event, filename) => {
    if (filename) onSourceChange(resolve(APP_ROOT, filename));
  });

  process.on("SIGINT", () => {
    cleanup(watcher);
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup(watcher);
    process.exit(0);
  });

  serve({
    port: PORT,
    websocket: {
      message() {},
      open(ws) {
        clients.add(ws);
      },
      close(ws) {
        clients.delete(ws);
      },
    },
    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/__hmr") {
        server.upgrade(req);
        return;
      }

      let filePath = join(
        DIST,
        url.pathname === "/" ? "index.html" : url.pathname,
      );
      if (!existsSync(filePath)) {
        const alt = join(DIST, url.pathname + ".html");
        if (existsSync(alt)) filePath = alt;
        else {
          const fallback = join(DIST, "404.html");
          if (existsSync(fallback)) filePath = fallback;
          else return new Response("Not Found", { status: 404 });
        }
      }

      return readFile(filePath).then((content) => {
        const ext = extname(filePath);
        const mime = mimeTypes[ext] || "application/octet-stream";
        let body: string | Uint8Array = content;
        if (ext === ".html") body = injectLiveReload(content.toString("utf-8"));
        return new Response(body as BodyInit, {
          headers: { "Content-Type": mime },
        });
      });
    },
    error(err) {
      console.error("[dev]", err);
    },
  });
}

main().catch(console.error);
