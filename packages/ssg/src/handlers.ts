import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { DiscoverPagesOptions, DiscoveredPage, ModuleLoader } from "./types.js";

import { failure, diagnose, contextualError } from "./errors.js";
import { defaultHandlers, metadata, vincleRuntime } from "./formats.js";
import { loadModule } from "./module.js";
import { routeForFile, outputPathForRoute } from "./routes.js";

function defaultModules(): ModuleLoader {
  const cache = new Map<string, Promise<Record<string, unknown>>>();
  return {
    load(file, importSource, compiled) {
      const key = `${file}\0${importSource}\0${compiled ?? ""}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = loadModule(file, importSource, compiled);
        cache.set(key, pending);
      }
      return pending;
    },
  };
}

/** Discover/load pages using exactly the same handler contract as build(). */
export async function discoverPages(options: DiscoverPagesOptions = {}): Promise<DiscoveredPage[]> {
  return diagnose(() => discover(options), "Could not discover pages", {
    reason: "SOURCE_READ_FAILED",
    hint: "Check src, read permissions and registered handlers. Inspect the cause for the failing operation.",
    context: { src: options.src ?? "src", phase: "discovery" },
  });
}

async function discover(options: DiscoverPagesOptions): Promise<DiscoveredPage[]> {
  const src = path.resolve(options.src ?? "src");
  const concurrency = options.concurrency ?? 16;
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw failure("Discovery concurrency must be a positive integer.", {
      reason: "INVALID_CONFIG",
      hint: "Set concurrency to an integer greater than zero, such as 16.",
      context: { concurrency: String(concurrency) },
    });
  const handlers = { ...defaultHandlers, ...options.handlers };
  for (const extension of Object.keys(handlers))
    if (!/^\.[^.\\/]+$/.test(extension))
      throw failure(`Invalid handler extension: ${extension}`, {
        reason: "INVALID_HANDLER",
        hint: "Use one dotted extension such as .mdx or .pt as each handler key.",
        context: { extension },
      });
  let info;
  try {
    info = await stat(src);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw failure(
        "Source directory does not exist.",
        {
          reason: "SOURCE_MISSING",
          hint: "Create src or set src to the existing route directory.",
          context: { src },
        },
        error,
      );
    throw error;
  }
  if (!info.isDirectory())
    throw failure("Source path is not a directory.", {
      reason: "SOURCE_NOT_DIRECTORY",
      hint: "Set src to a directory containing route files, not to a file.",
      context: { src },
    });
  const files: string[] = [];
  const excluded = new Set(options.excludeDirectories);
  async function walk(directory: string): Promise<void> {
    try {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (/^[._]/.test(entry.name) || entry.name === "node_modules" || excluded.has(entry.name))
          continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (
          entry.isFile() &&
          !/\.(?:d|test|spec)\.[jt]sx?$/.test(entry.name) &&
          Object.hasOwn(handlers, path.extname(file)) &&
          handlers[path.extname(file)]
        )
          files.push(file);
      }
    } catch (error) {
      throw contextualError(error, "Could not read source directory", {
        reason: "SOURCE_READ_FAILED",
        hint: "Check directory read/search permissions and restore any deleted directory before rebuilding.",
        context: { directory, src },
      });
    }
  }
  await walk(src);
  files.sort();
  const modules = options.modules ?? defaultModules();
  const pages: DiscoveredPage[] = [];
  let index = 0;
  let failed = false;
  async function worker() {
    while (!failed && index < files.length) {
      const i = index++;
      const file = files[i]!;
      const handler = handlers[path.extname(file)];
      if (!handler) continue;
      try {
        const route = routeForFile(file, src);
        const source = {
          file,
          src,
          route,
          relativePath: path.relative(src, file).replace(/\\/g, "/"),
          outputPath: (extension?: string) => outputPathForRoute(route, extension),
          runtime: options.runtime ?? vincleRuntime,
          modules,
        };
        const page = await handler.load(source);
        pages[i] = { ...page, source, handler: handler.name, meta: metadata(page.meta, file) };
      } catch (error) {
        failed = true;
        throw contextualError(error, "Page handler failed", {
          reason: "SOURCE_FAILED",
          hint: "Fix the named handler or source file. Inspect the cause for the original failure.",
          context: { file, handler: handler.name },
        });
      }
    }
  }
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, files.length) }, worker),
  );
  const rejected = settled.find((entry) => entry.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  return pages;
}
