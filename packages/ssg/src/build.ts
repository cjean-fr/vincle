import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { PageCacheSession } from "./page-cache.js";
import type {
  PageContext,
  DiscoverPagesOptions,
  SsgOptions,
  SsgOutput,
  RenderedOutput,
  JsxRuntime,
  AssetBuild,
  SsgMeta,
} from "./types.js";

import { basePath } from "./base.js";
import { sourceDirectory, clientEntries } from "./conventions.js";
import { failure, diagnose, contextualError } from "./errors.js";
import { resolveHandlers, vincleRuntime } from "./formats.js";
import { discoverPages } from "./handlers.js";
import { createPageRenderer } from "./lifecycle.js";
import { generateSite, generateSiteCached, type PublicationCache } from "./outputs.js";
import { fullUrl } from "./routes.js";
import { sitemapOutputs } from "./sitemap.js";
import { createTimings, type BuildTimings } from "./timings.js";

/** Cached page runtimes must not retain the surrounding build's page arrays. */
function assetRuntime(runtime: JsxRuntime, assets?: AssetBuild): JsxRuntime {
  const render = assets?.render?.bind(assets);
  return render ? { ...runtime, render: (create) => render(runtime, create) } : runtime;
}

function publicUrl(output: SsgOutput): string {
  const url = output.url ?? `/${output.path.replace(/(^|\/)index\.html$/, "$1")}`;
  if (
    !url.startsWith("/") ||
    url.startsWith("//") ||
    url.includes("\\") ||
    /[?#\0]/.test(url) ||
    url.split("/").some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment))
  ) {
    throw failure(`Invalid output URL: ${url}`, {
      reason: "INVALID_ROUTE",
      hint: "Set output.url to an absolute path beginning with /, without query, fragment, host or traversal segments.",
      context: { url, path: output.path },
    });
  }
  return url;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function conventionalAssets(root: string, src: string) {
  for (const name of [
    "vite.config.ts",
    "vite.config.mts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.cts",
    "vite.config.cjs",
  ]) {
    if (await exists(path.join(root, name))) return (await import("./vite.js")).viteAssets();
  }
  if ((await clientEntries(root, src)).length)
    return (await import("./vite.js")).viteAssets({ configFile: false });
  return undefined;
}

/** One-line build report: generated HTML pages and elapsed time. */
export function buildSummary(files: readonly string[], milliseconds: number): string {
  const pages = files.filter((file) => file.endsWith(".html")).length;
  const duration =
    milliseconds < 1000
      ? `${Math.round(milliseconds)} ms`
      : `${(milliseconds / 1000).toFixed(2)} s`;
  return `${pages} ${pages === 1 ? "page" : "pages"} generated in ${duration}`;
}

/** Build routes, all their outputs, assets and sitemap before publishing. */
export async function build(
  options: SsgOptions = {},
): Promise<{ files: string[]; timings?: BuildTimings }> {
  return runBuild(options);
}

/** Internal dev path; production builds never share this cache. */
export function buildCached(
  options: SsgOptions,
  cache: PageCacheSession,
  publication: PublicationCache,
) {
  return runBuild(options, cache, publication);
}

function runBuild(options: SsgOptions, cache?: PageCacheSession, publication?: PublicationCache) {
  return diagnose(() => buildInternal(options, cache, publication), "SSG build failed", {
    reason: "BUILD_FAILED",
    hint: "Check the configuration and original cause. Correct the failing input or filesystem operation before retrying.",
    context: {
      root: options.root ?? process.cwd(),
      src: options.src ?? "src",
      out: options.out ?? "dist",
    },
  });
}

/** Validate the public URL and locale configuration before preparing assets. */
function siteConfiguration(options: SsgOptions): URL | undefined {
  const base = basePath(options.base);
  let site: URL | undefined;
  if (options.site !== undefined) {
    try {
      site = new URL(options.site);
    } catch (error) {
      throw failure(
        "Site must be an absolute HTTP(S) URL.",
        {
          reason: "INVALID_CONFIG",
          hint: 'Set site to the public origin, for example https://example.com, and base to its path prefix, for example "/docs/".',
          context: { site: options.site },
        },
        error,
      );
    }
    if (!/^https?:$/.test(site.protocol) || site.search || site.hash)
      throw failure("Site must be an absolute HTTP(S) URL without a query or fragment.", {
        reason: "INVALID_CONFIG",
        hint: "Set site to an http:// or https:// URL without ?query or #fragment.",
        context: { site: options.site },
      });
    if (base !== undefined) {
      if (site.pathname !== "/")
        throw failure("Site must be an origin when base is set.", {
          reason: "INVALID_CONFIG",
          hint: 'Move the path prefix from site to base: site: "https://example.com", base: "/docs/".',
          context: { site: options.site, base },
        });
      site.pathname = base;
    }
    // A path in site alone stays supported for existing configurations.
    site.pathname = `${site.pathname.replace(/\/$/, "")}/`;
  }
  if (
    options.i18n &&
    (!options.i18n.locales.length ||
      new Set(options.i18n.locales).size !== options.i18n.locales.length ||
      !options.i18n.locales.includes(options.i18n.defaultLocale) ||
      options.i18n.locales.some((locale) => !/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(locale)))
  )
    throw failure("Invalid i18n configuration", {
      reason: "INVALID_CONFIG",
      hint: "Declare unique BCP 47 locales and a defaultLocale from that list.",
      context: { phase: "configuration" },
    });
  return site;
}

function buildPaths(options: SsgOptions) {
  const root = path.resolve(options.root ?? process.cwd());
  const src = sourceDirectory(root, options.src);
  const out = path.resolve(root, options.out ?? "dist");
  if (out === src || src.startsWith(`${out}${path.sep}`) || out.startsWith(`${src}${path.sep}`)) {
    throw failure("Source and output directories must not contain one another.", {
      reason: "INVALID_CONFIG",
      hint: "Choose separate src and out directories, such as src and dist. Neither may be an ancestor of the other.",
      context: { root, src, out },
    });
  }
  return { root, src, out };
}

async function buildInternal(
  options: SsgOptions,
  cache?: PageCacheSession,
  publication?: PublicationCache,
): Promise<{ files: string[]; timings?: BuildTimings }> {
  const timings = options.timings ? createTimings() : undefined;
  const configurationStarted = timings === undefined ? 0 : performance.now();
  const { root, src, out } = buildPaths(options);
  const site = siteConfiguration(options);
  const handlers = resolveHandlers(options.handlers);
  if (timings) timings.phase("configuration", performance.now() - configurationStarted);
  const sourceStarted = timings === undefined ? 0 : performance.now();
  let sourceInfo;
  try {
    sourceInfo = await stat(src);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw failure(
        "Source directory does not exist. The build stopped before asset preparation or output publication.",
        {
          reason: "SOURCE_MISSING",
          hint: "Create the source directory or set build({ src }) to the existing route directory. Relative src paths are resolved from root. The previous output was left untouched.",
          context: { root, src, out, phase: "discovery" },
        },
        error,
      );
    }
    throw contextualError(error, "Could not inspect source directory", {
      reason: "SOURCE_READ_FAILED",
      hint: "Check the source path and filesystem read/search permissions, then retry.",
      context: { root, src, out, phase: "discovery" },
    });
  }
  if (!sourceInfo.isDirectory())
    throw failure("Source path is not a directory. The build stopped before output publication.", {
      reason: "SOURCE_NOT_DIRECTORY",
      hint: "Set src to a directory containing route files, not to a file. The previous output was left untouched.",
      context: { root, src, out, phase: "discovery" },
    });
  if (timings) timings.phase("source inspection", performance.now() - sourceStarted);
  // Temporary build files live beside out, like the publication stage.
  const workStarted = timings === undefined ? 0 : performance.now();
  await mkdir(path.dirname(out), { recursive: true });
  const work = await mkdtemp(path.join(path.dirname(out), ".vincle-build-"));
  if (timings) timings.phase("work directory", performance.now() - workStarted);
  let disposeAssets: (() => void | Promise<void>) | undefined;
  let result: { files: string[] };
  let cleanupStarted = 0;
  try {
    try {
      const assetsStarted = timings === undefined ? 0 : performance.now();
      const integration =
        options.assets === false
          ? undefined
          : (options.assets ?? (await conventionalAssets(root, src)));
      const runtime = options.runtime ?? vincleRuntime;
      const assets = integration
        ? await diagnose(
            async () =>
              integration.prepare({
                root,
                src,
                out: path.join(work, "assets"),
                runtime,
                base: basePath(options.base),
              }),
            "Could not prepare assets",
            {
              reason: "ASSETS_FAILED",
              hint: "Check the asset integration configuration and the original cause. Fix the failing entry/import or filesystem operation before rebuilding.",
              context: { root, src, out, phase: "assets" },
            },
          )
        : undefined;
      disposeAssets = assets?.dispose;
      if (timings) timings.phase("assets prepare", performance.now() - assetsStarted);
      const publicDirectory = path.join(root, "public");
      const publicCopy = (await exists(publicDirectory)) ? [{ from: publicDirectory }] : [];
      const renderRuntime = assetRuntime(runtime, assets);
      const urls = new Map<string, SsgMeta>();
      const htmlOutputs: { path: string; url: string; meta: SsgMeta }[] = [];
      const discoveryStarted = timings === undefined ? 0 : performance.now();
      const discover = (discovery: DiscoverPagesOptions) =>
        discoverPages({
          ...discovery,
          handlers: cache
            ? Object.fromEntries(
                Object.entries(resolveHandlers(discovery.handlers)).map(([extension, handler]) => [
                  extension,
                  handler ? cache.wrap(handler) : false,
                ]),
              )
            : discovery.handlers,
        });
      const discovery = { src, handlers, runtime: renderRuntime, modules: assets?.modules };
      const pages = (
        await (options.discover ? options.discover(discovery, discover) : discover(discovery))
      ).toReversed();
      if (timings) timings.phase("discovery", performance.now() - discoveryStarted);
      const renderPage = createPageRenderer();
      const contexts: PageContext[] = [];
      const pageCache = cache;
      async function* produce(): AsyncGenerator<SsgOutput> {
        // Drop rendered page closures as we advance; publication only needs their contexts.
        while (pages.length) {
          const page = pages.pop()!;
          let segment = timings === undefined ? 0 : performance.now();
          let active = 0;
          let renderedCount = 0;
          try {
            const hit = pageCache?.rendered(page);
            let context: PageContext | undefined;
            const rendered: RenderedOutput[] = [];
            if (hit?.context) contexts.push(hit.context);
            const outputs =
              hit?.outputs ??
              renderPage(page, {
                plugins: options.plugins,
                onContext: (value) => {
                  context = value;
                  contexts.push(value);
                },
              });
            for await (const output of outputs) {
              const meta = { ...page.meta, ...output.meta };
              if (output.path.endsWith(".html"))
                htmlOutputs.push({ path: output.path, url: publicUrl(output), meta });
              if (output.sitemap && site && options.sitemap !== false)
                urls.set(fullUrl(publicUrl(output), site), meta);
              if (pageCache && !hit) rendered.push(output);
              if (timings) {
                active += performance.now() - segment;
                renderedCount += 1;
              }
              yield output;
              if (timings) segment = performance.now();
            }
            if (pageCache && !hit && context) pageCache.store(page.source.file, context, rendered);
            if (timings)
              timings.page(page.source.route, active + performance.now() - segment, renderedCount);
          } catch (error) {
            throw contextualError(error, `Failed source ${page.source.relativePath}`, {
              reason: "SOURCE_FAILED",
              hint: "Fix this source's component/producer, imports or layout. Inspect the original cause.",
              context: { file: page.source.file, src, out },
            });
          }
        }
        if (site && options.sitemap !== false) yield* translatedSitemap(urls, site, options.i18n);
      }
      const publish = publication
        ? (preparedSite: Parameters<typeof generateSite>[0]) =>
            generateSiteCached(preparedSite, publication)
        : generateSite;
      const publicationStarted = timings === undefined ? 0 : performance.now();
      result = await publish({
        out,
        outputs: produce(),
        copy: [
          ...(assets ? [{ from: assets.directory }] : []),
          ...publicCopy,
          ...(options.copy ?? []).map((entry) => ({
            from: path.resolve(root, entry.from),
            to: entry.to,
          })),
        ],
        preserve: options.preserve,
        async beforePublish(prepared) {
          const context = {
            ...prepared,
            get files() {
              return prepared.files;
            },
            pages: contexts,
            outputs: htmlOutputs.map((output) =>
              Object.assign({}, output, {
                async read() {
                  return new TextDecoder().decode(await prepared.read(output.path));
                },
              }),
            ),
          };
          for (const plugin of options.plugins ?? [])
            await diagnose(async () => plugin.publish?.(context), "Plugin publish phase failed", {
              reason: "PLUGIN_FAILED",
              hint: "Fix the named plugin's publication hook or generated output. Publication has not started.",
              context: { plugin: plugin.name, hook: "publish", out },
            });
        },
      });
      if (timings) timings.publication(performance.now() - publicationStarted, result.files.length);
    } catch (error) {
      // Cleanup must not replace a failed build's original diagnostic.
      try {
        await disposeAssets?.();
      } catch {
        /* Preserve the build error. */
      }
      throw error;
    }
    cleanupStarted = timings === undefined ? 0 : performance.now();
    await diagnose(async () => disposeAssets?.(), "Asset cleanup failed after site publication", {
      reason: "ASSETS_FAILED",
      hint: "The site was published successfully. Fix the asset integration's dispose hook before rebuilding.",
      context: { root, src, out, phase: "cleanup" },
    });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  if (timings) timings.phase("cleanup", performance.now() - cleanupStarted);
  if (timings === undefined) return result;
  return { files: result.files, timings: timings.snapshot() };
}

/** Validate translation groups and add their alternate links to the sitemap. */
function* translatedSitemap(
  urls: ReadonlyMap<string, SsgMeta>,
  site: URL,
  i18n?: SsgOptions["i18n"],
) {
  const groups = new Map<string, Map<string, string>>();
  for (const [url, meta] of urls) {
    if (!i18n || !meta.translationKey || !meta.locale) continue;
    if (!i18n.locales.includes(meta.locale))
      throw failure(`Undeclared page locale: ${meta.locale}`, {
        reason: "INVALID_CONFIG",
        hint: "Declare the page locale in i18n.locales.",
        context: { url, locale: meta.locale },
      });
    const group = groups.get(meta.translationKey) ?? new Map<string, string>();
    if (group.has(meta.locale))
      throw failure(`Duplicate translation: ${meta.translationKey} (${meta.locale})`, {
        reason: "INVALID_OUTPUT",
        hint: "Use one public page per translation key and locale.",
        context: { url, locale: meta.locale },
      });
    group.set(meta.locale, url);
    groups.set(meta.translationKey, group);
  }
  yield* sitemapOutputs(
    [...urls]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([url, meta]) => {
        const group = meta.translationKey ? groups.get(meta.translationKey) : undefined;
        const alternates = group ? [...group].map(([locale, href]) => ({ locale, href })) : [];
        const fallback = i18n && group?.get(i18n.defaultLocale);
        if (fallback) alternates.push({ locale: "x-default", href: fallback });
        return { url, alternates };
      }),
    site,
  );
}
