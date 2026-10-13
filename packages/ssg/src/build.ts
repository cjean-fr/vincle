import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { PageContext, SsgOptions, SsgOutput } from "./types.js";

import { failure, diagnose, contextualError } from "./errors.js";
import { defaultHandlers, vincleRuntime } from "./formats.js";
import { discoverPages } from "./handlers.js";
import { renderPage } from "./lifecycle.js";
import { generateSite } from "./outputs.js";

function publicUrl(output: SsgOutput): string {
  const url = output.url ?? `/${output.path.replace(/(^|\/)index\.html$/, "$1")}`;
  if (
    !url.startsWith("/") ||
    url.startsWith("//") ||
    url.includes("\\") ||
    /[?#\0]/.test(url) ||
    url.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw failure(`Invalid output URL: ${url}`, {
      reason: "INVALID_ROUTE",
      hint: "Set output.url to an absolute path beginning with /, without query, fragment, host or traversal segments.",
      context: { url, path: output.path },
    });
  }
  return url;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
  for (const extension of ["ts", "js", "tsx", "jsx", "css"]) {
    if (await exists(path.join(src, "_client", `main.${extension}`)))
      return (await import("./vite.js")).viteAssets({ configFile: false });
  }
  return undefined;
}

/** Build routes, all their outputs, assets and sitemap before publishing. */
export async function build(options: SsgOptions = {}): Promise<{ files: string[] }> {
  return diagnose(() => buildInternal(options), "SSG build failed", {
    reason: "BUILD_FAILED",
    hint: "Check the configuration and original cause. Correct the failing input or filesystem operation before retrying.",
    context: {
      root: options.root ?? process.cwd(),
      src: options.src ?? "src",
      out: options.out ?? "dist",
    },
  });
}

async function buildInternal(options: SsgOptions): Promise<{ files: string[] }> {
  const root = path.resolve(options.root ?? process.cwd());
  const src = path.resolve(root, options.src ?? "src");
  const out = path.resolve(root, options.out ?? "dist");
  if (out === src || src.startsWith(`${out}${path.sep}`) || out.startsWith(`${src}${path.sep}`)) {
    throw failure("Source and output directories must not contain one another.", {
      reason: "INVALID_CONFIG",
      hint: "Choose separate src and out directories, such as src and dist. Neither may be an ancestor of the other.",
      context: { root, src, out },
    });
  }
  let site: URL | undefined;
  if (options.site !== undefined) {
    try {
      site = new URL(options.site);
    } catch (error) {
      throw failure(
        "Site must be an absolute HTTP(S) URL.",
        {
          reason: "INVALID_CONFIG",
          hint: "Set site to the full public URL, for example https://example.com/docs/.",
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
    site.pathname = `${site.pathname.replace(/\/$/, "")}/`;
  }
  const handlers = { ...defaultHandlers, ...options.handlers };
  for (const extension of Object.keys(handlers)) {
    if (!/^\.[^.\\/]+$/.test(extension))
      throw failure(`Invalid handler extension: ${extension}`, {
        reason: "INVALID_HANDLER",
        hint: 'Register handlers by a single dotted extension, for example { ".pt": handler }, or use false to disable a format.',
        context: { extension },
      });
  }
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
  const work = await mkdtemp(path.join(tmpdir(), "vincle-ssg-assets-"));
  let disposeAssets: (() => void | Promise<void>) | undefined;
  try {
    const integration =
      options.assets === false
        ? undefined
        : (options.assets ?? (await conventionalAssets(root, src)));
    const runtime = options.runtime ?? vincleRuntime;
    const assets = integration
      ? await diagnose(
          async () => integration.prepare({ root, src, out: path.join(work, "assets"), runtime }),
          "Could not prepare assets",
          {
            reason: "ASSETS_FAILED",
            hint: "Check the asset integration configuration and the original cause. Fix the failing entry/import or filesystem operation before rebuilding.",
            context: { root, src, out, phase: "assets" },
          },
        )
      : undefined;
    disposeAssets = assets?.dispose;
    const publicDirectory = path.join(root, "public");
    const publicCopy = (await exists(publicDirectory)) ? [{ from: publicDirectory }] : [];
    const renderRuntime = assets?.render
      ? { ...runtime, render: (create: () => unknown) => assets.render!(runtime, create) }
      : runtime;
    const urls = new Set<string>();
    const pages = await discoverPages({
      src,
      handlers,
      runtime: renderRuntime,
      modules: assets?.modules,
    });
    const contexts: PageContext[] = [];
    async function* produce(): AsyncGenerator<SsgOutput> {
      for (const page of pages) {
        try {
          for await (const output of renderPage(page, {
            plugins: options.plugins,
            onContext: (context) => {
              contexts.push(context);
            },
          })) {
            if (output.sitemap && site && options.sitemap !== false)
              urls.add(new URL(publicUrl(output).slice(1), site).href);
            yield output;
          }
        } catch (error) {
          throw contextualError(error, `Failed source ${page.source.relativePath}`, {
            reason: "SOURCE_FAILED",
            hint: "Fix this source's component/producer, imports or layout. Inspect the original cause.",
            context: { file: page.source.file, src, out },
          });
        }
      }
      if (site && options.sitemap !== false) {
        if (urls.size > 50_000)
          throw failure("A sitemap cannot contain more than 50,000 URLs.", {
            reason: "INVALID_OUTPUT",
            hint: "Disable the built-in sitemap and generate split sitemap files with an index, or reduce included outputs.",
            context: { count: urls.size },
          });
        yield {
          path: "sitemap.xml",
          content:
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            [...urls]
              .toSorted()
              .map((url) => `<url><loc>${escapeXml(url)}</loc></url>`)
              .join("") +
            "</urlset>\n",
        };
      }
    }
    return await generateSite({
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
        for (const plugin of options.plugins ?? [])
          await diagnose(
            async () =>
              plugin.publish?.({
                ...prepared,
                get files() {
                  return prepared.files;
                },
                pages: contexts,
              }),
            "Plugin publish phase failed",
            {
              reason: "PLUGIN_FAILED",
              hint: "Fix the named plugin's publication hook or generated output. Publication has not started.",
              context: { plugin: plugin.name, hook: "publish", out },
            },
          );
      },
    });
  } finally {
    await disposeAssets?.();
    await rm(work, { recursive: true, force: true });
  }
}
