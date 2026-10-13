import { Scope } from "@vincle/core";
import { setVite } from "@vincle/vite-plugin";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createServer, mergeConfig, type InlineConfig, type ViteDevServer } from "vite";

import type { SsgOptions } from "./types.js";

import { buildCached } from "./build.js";
import { developmentModules } from "./dev-modules.js";
import { diagnose } from "./errors.js";
import { PublicationCache } from "./outputs.js";
import { PageCache } from "./page-cache.js";

export interface DevOptions extends Omit<SsgOptions, "assets"> {
  /** Vite development server options, including host, port and base. */
  vite?: InlineConfig;
}
export interface DevServer {
  vite: ViteDevServer;
  /** Render affected pages and publish all outputs; force bypasses the page cache. */
  rebuild(options?: { force?: boolean }): Promise<void>;
  close(): Promise<void>;
}

/** Serve-mode SSR graph, source assets and page regeneration share one persistent Vite server. */
export async function dev(options: DevOptions = {}): Promise<DevServer> {
  return diagnose(() => start(options), "Could not start the SSG development server", {
    reason: "BUILD_FAILED",
    hint: "Check sources, Vite configuration and the requested host/port. Inspect the original cause.",
    context: { root: options.root ?? process.cwd(), phase: "dev" },
  });
}

async function start(options: DevOptions): Promise<DevServer> {
  const root = path.resolve(options.root ?? process.cwd());
  const work = await mkdtemp(path.join(root, ".vincle-dev-"));
  const out = path.join(work, "site");
  const assets = path.join(work, "assets");
  await mkdir(assets);
  const compiler = developmentModules(
    options.runtime?.importSource ?? "@vincle/core",
    path.resolve(root, options.src ?? "src"),
  );
  const cache = new PageCache(compiler.dependencies);
  const publication = new PublicationCache();
  let forceNext = false;
  let generation = 0;
  const changes = new Set<string>();
  let watcher: ViteDevServer["watcher"] | undefined;
  let server: ViteDevServer | undefined;
  let files = new Set<string>();
  let closed = false;
  let pending: Promise<void> | undefined;
  let requested = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const regenerate = async () => {
    cache.invalidate(changes);
    changes.clear();
    cache.invalidate(await compiler.refresh());
    if (generation !== compiler.generation) {
      generation = compiler.generation;
      cache.force();
    }
    if (forceNext) {
      cache.force();
      forceNext = false;
    }
    const session = cache.begin(options);
    const result = await buildCached(
      {
        ...options,
        root,
        out,
        assets: {
          prepare() {
            return {
              directory: assets,
              modules: compiler.modules,
              render(runtime, create) {
                return Scope.with(() =>
                  runtime.render(() => {
                    // Vite applies the development base during transformIndexHtml.
                    setVite(null, { base: "/" });
                    return create();
                  }),
                );
              },
            };
          },
        },
      },
      session,
      publication,
    );
    await compiler.setWatched(session.commit());
    const lateChanges = await compiler.refresh();
    cache.invalidate(lateChanges);
    cache.invalidate(changes);
    if (lateChanges.size || changes.size) requested = true;
    files = new Set(result.files);
    server?.ws.send({ type: "full-reload", path: "*" });
  };
  const rebuild = (request?: { force?: boolean }): Promise<void> => {
    if (request?.force) forceNext = true;
    if (closed) return Promise.resolve();
    requested = true;
    if (!pending) {
      pending = (async () => {
        while (requested) {
          if (closed) break;
          requested = false;
          await diagnose(regenerate, "Incremental development build failed", {
            reason: "BUILD_FAILED",
            hint: "Check changed sources, watched data files, Vite configuration and plugin hooks. Inspect the original cause and fix read/watch permissions or the failing input before retrying.",
            context: { root, phase: "dev" },
          });
        }
      })().finally(() => {
        pending = undefined;
      });
    }
    return pending;
  };
  const published = path.resolve(root, options.out ?? "dist");
  const onChange = (_event: string, file: string) => {
    const absolute = path.resolve(file);
    if (
      closed ||
      absolute === work ||
      absolute.startsWith(work + path.sep) ||
      absolute === published ||
      absolute.startsWith(published + path.sep) ||
      absolute
        .split(path.sep)
        .some(
          (segment) =>
            segment === "node_modules" ||
            segment === ".git" ||
            segment === ".compiled" ||
            segment.startsWith(".vincle-"),
        )
    )
      return;
    changes.add(absolute);
    clearTimeout(timer);
    timer = setTimeout(() => {
      void rebuild().catch((error) => {
        server!.config.logger.error(String(error));
        server!.ws.send({
          type: "error",
          err: {
            message: String(error),
            stack: error instanceof Error ? (error.stack ?? "") : "",
          },
        });
      });
    }, 75);
  };
  try {
    server = await createServer(
      mergeConfig(options.vite ?? {}, {
        root,
        appType: "custom",
        oxc: {
          jsx: {
            runtime: "automatic",
            importSource: options.runtime?.importSource ?? "@vincle/core",
          },
        },
        ssr: {
          external: ["@vincle/core", "@vincle/vite-plugin"],
          resolve: { externalConditions: ["node", ...("Bun" in globalThis ? ["bun"] : [])] },
        },
        environments: {
          ssr: {
            resolve: {
              external: [
                "@vincle/core",
                "@vincle/core/jsx-runtime",
                "@vincle/core/jsx-dev-runtime",
                "@vincle/vite-plugin",
              ],
              conditions: ["node", "development", ...("Bun" in globalThis ? ["bun"] : [])],
              externalConditions: ["node", ...("Bun" in globalThis ? ["bun"] : [])],
            },
          },
        },
        plugins: [
          compiler.plugin,
          {
            name: "vincle-ssg-dev",
            configureServer(vite: ViteDevServer) {
              watcher?.off("all", onChange);
              watcher = vite.watcher;
              watcher.on("all", onChange);
              watcher.add(path.resolve(root, options.src ?? "src"));
              for (const resource of options.copy ?? [])
                watcher.add(path.resolve(root, resource.from));
              return () => {
                vite.middlewares.use((request, response, next) => {
                  void (async () => {
                    if (request.method !== "GET" && request.method !== "HEAD") return next();
                    try {
                      const url = new URL(
                        request.originalUrl ?? request.url ?? "/",
                        "http://localhost",
                      );
                      let pathname = decodeURIComponent(url.pathname);
                      const base = vite.config.base;
                      if (!pathname.startsWith(base)) return next();
                      pathname = pathname.slice(base.length);
                      const file =
                        pathname.endsWith("/") || !pathname
                          ? `${pathname}index.html`
                          : files.has(pathname)
                            ? pathname
                            : `${pathname}/index.html`;
                      if (!files.has(file)) return next();
                      const bytes = await readFile(path.join(out, file));
                      if (file.endsWith(".html")) {
                        response.setHeader("Content-Type", "text/html; charset=utf-8");
                        response.end(
                          request.method === "HEAD"
                            ? undefined
                            : await vite.transformIndexHtml(url.pathname, bytes.toString()),
                        );
                      } else {
                        const mime: Record<string, string> = {
                          ".json": "application/json",
                          ".txt": "text/plain",
                          ".md": "text/plain",
                          ".xml": "application/xml",
                          ".css": "text/css",
                          ".js": "text/javascript",
                          ".png": "image/png",
                          ".jpg": "image/jpeg",
                          ".webp": "image/webp",
                          ".svg": "image/svg+xml",
                          ".ico": "image/x-icon",
                        };
                        response.setHeader(
                          "Content-Type",
                          mime[path.extname(file)] ?? "application/octet-stream",
                        );
                        response.end(request.method === "HEAD" ? undefined : bytes);
                      }
                    } catch (error) {
                      next(error);
                    }
                  })();
                });
              };
            },
          },
        ],
      }),
    );
    await rebuild();
    await server.listen();
    return {
      vite: server,
      rebuild,
      async close() {
        closed = true;
        clearTimeout(timer);
        watcher?.off("all", onChange);
        await pending?.catch(() => {});
        await server!.close();
        cache.clear();
        publication.clear();
        compiler.dispose();
        await rm(work, { recursive: true, force: true });
      },
    };
  } catch (error) {
    watcher?.off("all", onChange);
    await server?.close();
    cache.clear();
    publication.clear();
    compiler.dispose();
    await rm(work, { recursive: true, force: true });
    throw error;
  }
}
