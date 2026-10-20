import type { ServerResponse } from "node:http";

import { Scope } from "@vincle/core";
import { setVite } from "@vincle/vite-plugin";
import fs from "node:fs";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createServer,
  mergeConfig,
  type Connect,
  type InlineConfig,
  type ViteDevServer,
} from "vite";

import type { AssetIntegration, SsgOptions } from "./types.js";

import { basePath, withBase } from "./base.js";
import { buildCached, buildSummary } from "./build.js";
import { sourceDirectory } from "./conventions.js";
import { developmentModules } from "./dev-modules.js";
import { diagnose } from "./errors.js";
import { resolveMimeTypes, type MimeTypes } from "./mime.js";
import { PublicationCache } from "./outputs.js";
import { PageCache } from "./page-cache.js";
import { loadViteConfig } from "./vite-config.js";

export interface DevOptions extends Omit<SsgOptions, "assets"> {
  /** Vite development server options, including host, port and base. */
  vite?: InlineConfig;
  /** Add or override content types for generated/copied files. */
  mimeTypes?: MimeTypes;
  /** Generated error page used for unknown paths; response status remains 404. */
  notFound?: string | ((pathname: string) => string);
  /** Explicit development redirects; keys and destinations are URL paths. */
  redirects?: Readonly<Record<string, string>>;
  /** HTTP statuses for generated URL paths, e.g. /404.html. */
  statuses?: Readonly<Record<string, number>>;
}
export interface DevServer {
  vite: ViteDevServer;
  /** Render affected pages and publish all outputs; force bypasses the page cache. */
  rebuild(options?: { force?: boolean }): Promise<void>;
  close(): Promise<void>;
}

const privateDirectories =
  /(?:^|[\\/])(?:\.git|\.aws|\.agents|\.codex|node_modules|\.vincle[^\\/]*)(?:[\\/]|$)/;
const bun = "Bun" in globalThis ? ["bun"] : [];

const inside = (file: string, directory: string) =>
  file === directory || file.startsWith(directory + path.sep);
const exhausted = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOSPC";

/** Serve-mode SSR graph, source assets and page regeneration share one persistent Vite server. */
export async function dev(options: DevOptions = {}): Promise<DevServer> {
  return diagnose(() => start(options), "Could not start the SSG development server", {
    reason: "BUILD_FAILED",
    hint: "Check sources, Vite configuration and the requested host/port. Inspect the original cause.",
    context: { root: options.root ?? process.cwd(), phase: "dev" },
  });
}

/** Load the project's Vite config and add Tailwind and the watcher policy. */
async function userConfig(
  options: DevOptions,
  root: string,
  ignored: (file: string) => boolean,
): Promise<{ config: InlineConfig; polling: boolean; fallback: boolean }> {
  const vite = options.vite ?? {};
  const config = withBase(
    await loadViteConfig(vite, root, { command: "serve", mode: vite.mode ?? "development" }),
    basePath(options.base),
  );
  const watch = config.server?.watch;
  if (watch === null) return { config, polling: false, fallback: false };
  let polling = watch?.usePolling === true;
  let fallback = false;
  if (!polling) {
    try {
      fs.watch(root, () => {}).close();
    } catch (error) {
      if (!exhausted(error)) throw error;
      polling = fallback = true;
    }
  }
  config.server = {
    ...config.server,
    watch: {
      ...watch,
      ...(polling ? { usePolling: true } : {}),
      ignored: [...(watch?.ignored === undefined ? [] : [watch.ignored].flat()), ignored],
    },
  };
  return { config, polling, fallback };
}

/** Map a base-relative request path onto a generated file. */
function generatedFile(pathname: string, files: ReadonlySet<string>) {
  const candidates =
    !pathname || pathname.endsWith("/")
      ? [`${pathname}index.html`]
      : [pathname, `${pathname}/index.html`, `${pathname}.html`];
  return candidates.find((file) => files.has(file));
}

const requestUrl = (request: Connect.IncomingMessage) =>
  new URL(request.originalUrl ?? request.url ?? "/", "http://localhost");

async function start(options: DevOptions): Promise<DevServer> {
  const root = path.resolve(options.root ?? process.cwd());
  const importSource = options.runtime?.importSource ?? "@vincle/core";
  const src = sourceDirectory(root, options.src);
  const published = path.resolve(root, options.out ?? "dist");
  const mimeTypes = resolveMimeTypes(options.mimeTypes);
  const work = await mkdtemp(path.join(tmpdir(), "vincle-dev-"));
  // Builds keep their temporary files beside out, inside work.
  const out = path.join(work, "site");
  const compiler = developmentModules(importSource, src);
  const cache = new PageCache(compiler.dependencies);
  const publication = new PublicationCache();
  const assets: AssetIntegration = {
    async prepare(context) {
      // Vite serves client assets in development; nothing is prebuilt.
      await mkdir(context.out, { recursive: true });
      return {
        directory: context.out,
        modules: compiler.modules,
        render: (runtime, create) =>
          Scope.with(() =>
            runtime.render(() => {
              // Vite applies the development base during transformIndexHtml.
              setVite(null, { base: "/" });
              return create();
            }),
          ),
      };
    },
  };
  const ignored = (file: string) =>
    inside(file, work) || inside(file, published) || privateDirectories.test(file);

  let server: ViteDevServer | undefined;
  let closeVite: (() => Promise<void>) | undefined;
  let detachWatcher = () => {};
  let files = new Set<string>();
  const changes = new Set<string>();
  let force = false;
  let closed = false;
  let polling = false;
  let pending: Promise<void> | undefined;
  let requested = false;
  let recovering: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const regenerate = async () => {
    const started = performance.now();
    cache.invalidate(changes);
    changes.clear();
    cache.invalidate(await compiler.refresh());
    if (force) {
      cache.force();
      force = false;
    }
    const session = cache.begin(options);
    const result = await buildCached({ ...options, root, out, assets }, session, publication);
    await compiler.setWatched(session.commit());
    // Edits that land during publication schedule another pass.
    const late = await compiler.refresh();
    cache.invalidate(late);
    cache.invalidate(changes);
    if (late.size || changes.size) requested = true;
    files = new Set(result.files);
    server?.config.logger.info(
      `[vincle/ssg] ${buildSummary(result.files, performance.now() - started)}`,
      { timestamp: true },
    );
    server?.ws.send({ type: "full-reload", path: "*" });
  };
  const rebuild = (request?: { force?: boolean }): Promise<void> => {
    if (request?.force) force = true;
    if (closed) return Promise.resolve();
    requested = true;
    pending ??= (async () => {
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
    return pending;
  };
  const onChange = (_event: string, file: string) => {
    const absolute = path.resolve(file);
    if (closed || ignored(absolute)) return;
    changes.add(absolute);
    clearTimeout(timer);
    timer = setTimeout(() => {
      rebuild().catch((error: unknown) => {
        server!.config.logger.error(String(error));
        server!.ws.send({
          type: "error",
          err: { message: String(error), stack: error instanceof Error ? (error.stack ?? "") : "" },
        });
      });
    }, 75);
  };
  const recoverWatchers = (vite: ViteDevServer, error: unknown) => {
    if (closed || polling || !exhausted(error)) return;
    polling = true;
    vite.config.logger.warn(
      "[vincle/ssg] Native file watcher limit reached (ENOSPC); switching to polling.",
    );
    const inline = vite.config.inlineConfig;
    inline.server = { ...inline.server, watch: { ...inline.server?.watch, usePolling: true } };
    recovering = (async () => {
      await pending?.catch(() => {});
      if (closed) return;
      await vite.restart();
      await rebuild({ force: true });
    })()
      .catch((cause) => {
        vite.config.logger.error(`[vincle/ssg] Could not recover file watching: ${String(cause)}`);
      })
      .finally(() => {
        recovering = undefined;
      });
  };
  const send = async (
    vite: ViteDevServer,
    request: Connect.IncomingMessage,
    response: ServerResponse,
    file: string,
    status: number,
  ) => {
    const bytes = await readFile(path.join(out, file));
    response.statusCode = status;
    response.setHeader(
      "Content-Type",
      mimeTypes[path.extname(file).toLowerCase()] ?? "application/octet-stream",
    );
    if (request.method === "HEAD") response.end();
    else if (file.endsWith(".html"))
      response.end(await vite.transformIndexHtml(requestUrl(request).pathname, bytes.toString()));
    else response.end(bytes);
  };
  const serving =
    (
      handle: (
        vite: ViteDevServer,
        request: Connect.IncomingMessage,
        response: ServerResponse,
      ) => Promise<boolean>,
    ) =>
    (vite: ViteDevServer): Connect.NextHandleFunction =>
    (request, response, next) => {
      if (request.method !== "GET" && request.method !== "HEAD") next();
      else
        void handle(vite, request, response).then((handled) => {
          if (!handled) next();
        }, next);
    };

  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      closed = true;
      clearTimeout(timer);
      detachWatcher();
      await pending?.catch(() => {});
      await recovering;
      await closeVite?.();
      cache.clear();
      publication.clear();
      compiler.dispose();
      await rm(work, { recursive: true, force: true });
    })());

  const pages = serving(async (vite, request, response) => {
    const url = requestUrl(request);
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith(vite.config.base)) return false;
    const redirect = options.redirects?.[url.pathname];
    if (redirect) {
      response.statusCode = 308;
      response.setHeader("Location", redirect);
      response.end();
      return true;
    }
    const file = generatedFile(pathname.slice(vite.config.base.length), files);
    if (!file) return false;
    await send(vite, request, response, file, options.statuses?.[`/${file}`] ?? 200);
    return true;
  });
  const notFound = serving(async (vite, request, response) => {
    const pathname = requestUrl(request).pathname;
    if (!options.notFound || !pathname.startsWith(vite.config.base)) return false;
    const page =
      typeof options.notFound === "function" ? options.notFound(pathname) : options.notFound;
    const file = page.replace(/^\//, "");
    if (!files.has(file)) return false;
    await send(vite, request, response, file, 404);
    return true;
  });

  try {
    const user = await userConfig(options, root, ignored);
    polling = user.polling;
    server = await createServer(
      mergeConfig(user.config, {
        configFile: false,
        server: {
          host: user.config.server?.host ?? "127.0.0.1",
          port: user.config.server?.port ?? Number(process.env["PORT"] ?? 4321),
        },
        root,
        appType: "custom",
        oxc: { jsx: { runtime: "automatic", importSource } },
        environments: {
          ssr: {
            resolve: {
              external: [
                "@vincle/core",
                "@vincle/core/jsx-runtime",
                "@vincle/core/jsx-dev-runtime",
                "@vincle/vite-plugin",
                "@vincle/ssg",
              ],
              conditions: ["node", "development", ...bun],
              externalConditions: ["node", ...bun],
            },
          },
        },
        plugins: [
          compiler.plugin,
          {
            name: "vincle-ssg-dev",
            // Runs again for each Vite restart, which replaces the server's methods.
            configureServer(vite: ViteDevServer) {
              force = true;
              detachWatcher();
              const watcherError = (error: unknown) => recoverWatchers(vite, error);
              vite.watcher.on("error", watcherError);
              vite.watcher.on("all", onChange);
              detachWatcher = () => {
                vite.watcher.off("error", watcherError);
                vite.watcher.off("all", onChange);
              };
              vite.watcher.add(src);
              for (const resource of options.copy ?? [])
                vite.watcher.add(path.resolve(root, resource.from));
              // Vite's SIGTERM/stdin handlers must await SSG cleanup before exiting.
              closeVite = vite.close.bind(vite);
              vite.close = close;
              vite.middlewares.use(pages(vite));
              // Error pages run after Vite has served client modules/assets.
              return () => vite.middlewares.use(notFound(vite));
            },
          },
        ],
      }),
    );
    if (user.fallback)
      server.config.logger.warn(
        "[vincle/ssg] Native file watcher limit reached (ENOSPC); using polling.",
      );
    await rebuild();
    await server.listen();
    return { vite: server, rebuild, close };
  } catch (error) {
    await close();
    throw error;
  }
}
