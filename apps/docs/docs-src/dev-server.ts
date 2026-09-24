import type { ServerWebSocket } from "bun";

import { serve } from "bun";
import { watch } from "node:fs";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

import { initBuild, rebuildAll, refreshPages } from "./lib/build-engine.js";

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

const configFile = resolve(APP_ROOT, "docs.config.ts");

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
const pendingChanges = new Set<string>();
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleRebuild(filePath: string): void {
  if (
    filePath.includes("node_modules") ||
    filePath.includes("/dist/") ||
    filePath.includes("/.git/") ||
    filePath.includes(".compiled")
  )
    return;
  pendingChanges.add(filePath);
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => void rebuildChangedSources(), 60);
}

async function rebuildChangedSources(): Promise<void> {
  rebuildTimer = undefined;
  if (rebuilding || pendingChanges.size === 0) return;
  rebuilding = true;
  try {
    while (pendingChanges.size > 0) {
      const changedFiles = [...pendingChanges];
      pendingChanges.clear();

      if (changedFiles.includes(configFile)) {
        console.log("[dev] Config changed, full rebuild...");
        watcher.close();
        process.exit(0); // Restart required for config changes
      }

      // Rediscover pages so changed MDX is recompiled and page metadata stays current.
      await refreshPages();
      notifyClients();
    }
  } finally {
    rebuilding = false;
    if (pendingChanges.size > 0 && !rebuildTimer) {
      rebuildTimer = setTimeout(() => void rebuildChangedSources(), 60);
    }
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

function cleanup(w: ReturnType<typeof watch>): void {
  w.close();
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
    if (filename) scheduleRebuild(resolve(APP_ROOT, filename));
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

      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = resolve(DIST, "." + pathname);
      if (filePath !== DIST && !filePath.startsWith(DIST + "/"))
        return new Response("Forbidden", { status: 403 });
      let target = filePath;
      if (!existsSync(target)) {
        const alt = target + ".html";
        if (existsSync(alt)) target = alt;
        else {
          const fallback = join(DIST, "404.html");
          if (existsSync(fallback)) target = fallback;
          else return new Response("Not Found", { status: 404 });
        }
      }

      return readFile(target).then((content) => {
        const ext = extname(target);
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
