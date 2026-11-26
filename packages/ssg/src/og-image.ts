import { Fragment } from "@vincle/core";
/**
 * Social cards (`og:image`) generated at build time from a colocated
 * `_og-image` module. Lookup, inheritance and overrides mirror `_layout`:
 * the nearest module wins, `meta.ogImage` selects one explicitly or disables
 * the card with `false`.
 *
 * The rendering engine is loaded on demand: a site without any `_og-image`
 * file pays nothing, and the optional peer dependencies stay optional.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ModuleLoader, SsgMeta, SourceContext } from "./types.js";

import { failure } from "./errors.js";

/** Pixel size of one social card. */
export interface OgImageSize {
  width: number;
  height: number;
}

/**
 * One font usable in a social card, declared by an `_og-image` module.
 * `path` resolves relative to the module file.
 */
export interface OgImageFont {
  name: string;
  path: string;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style?: "normal" | "italic";
}

/** Context passed to every social card component. */
export interface OgImageContext {
  /** The page's extensionless route ("/guide/"). */
  url: string;
  title?: string;
  description?: string;
  /** The page's shared metadata object. */
  meta: SsgMeta;
}

/** Social card component: pure JSX, stateless, no DOM or browser APIs. */
export type OgImageRender = (context: OgImageContext) => unknown;

/** A named extra card: emitted as `og-<name>.png` next to the default one. */
export type OgImageVariant = OgImageRender | { render: OgImageRender; size?: OgImageSize };

const OG_IMAGE_BASENAME = "_og-image";
const OG_IMAGE_EXTENSIONS = ["tsx", "jsx", "ts", "js"];
const DEFAULT_SIZE: OgImageSize = { width: 1200, height: 630 };
const CACHE_VERSION = "v1";

interface LoadedOgImage {
  render: OgImageRender;
  variants: Record<string, { render: OgImageRender; size: OgImageSize }>;
  size: OgImageSize;
  fonts: Array<{ name: string; data: Buffer; weight: number; style: string }>;
  /** Font files read for this module, so callers can watch them. */
  fontFiles: string[];
}

/** One engine shape: the subset of satori this renderer relies on. */
interface Satori {
  (element: unknown, options: Record<string, unknown>): Promise<string>;
}

interface Resvg {
  new (
    svg: string,
    options?: Record<string, unknown>,
  ): {
    render(): { asPng(): Uint8Array };
  };
}

/** How Node and Bun phrase an unresolvable import: the requested specifier, quoted. */
const REQUESTED_MODULE = /Cannot find (?:module|package) ["']([^"']+)["']/;

/**
 * Only a genuinely absent package gets the install hint; anything else
 * surfaces as-is. The requested specifier must be the targeted package
 * exactly: a nested companion ("@resvg/resvg-js-linux-x64-gnu" under npm,
 * "@resvg+resvg-js@…" store paths under Bun's isolated installs) contains
 * the name as a substring but is a different failure.
 */
export function isMissingPackage(error: unknown, name: string): boolean {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" &&
    REQUESTED_MODULE.exec(error.message)?.[1] === name
  );
}

/** The engine is an optional peer; load it once and explain how to add it. */
function loadEngine<T>(name: string, file: string): Promise<T> {
  // A computed specifier keeps the bundler from resolving the optional peer.
  return (import(name) as Promise<T>).catch((error: unknown) => {
    if (!isMissingPackage(error, name)) throw error;
    throw failure(
      `Social cards need the optional "${name}" dependency.`,
      {
        reason: "OG_IMAGE_FAILED",
        hint: `Install the rendering dependencies next to @vincle/ssg: bun add satori @resvg/resvg-js (or npm install satori @resvg/resvg-js).`,
        context: { file },
      },
      error,
    );
  });
}

let satoriModule: Promise<{ default: Satori }> | undefined;
let resvgModule: Promise<{ Resvg: Resvg }> | undefined;

/**
 * The default card font (Inter, OFL-licensed, Latin subset) ships inside the
 * package so a minimal `_og-image` module works with no font setup. Sites
 * needing other scripts or a brand font declare `export const fonts`.
 */
let bundledFontsPromise: Promise<LoadedOgImage["fonts"]> | undefined;
function bundledFonts(): Promise<LoadedOgImage["fonts"]> {
  return (bundledFontsPromise ??= Promise.all(
    (
      [
        { file: "inter-latin-400-normal.woff2", weight: 400 },
        { file: "inter-latin-700-normal.woff2", weight: 700 },
      ] as const
    ).map(async ({ file, weight }) => ({
      name: "Inter",
      data: await readFile(path.resolve(import.meta.dirname, "..", "fonts", file)),
      weight,
      style: "normal",
    })),
  ));
}

/**
 * Resolve the `_og-image` module for one page; the nearest ancestor wins.
 * The walk boundary comes from the discovery root: same convention as
 * _layout, a src/pages sources directory keeps its root module one level
 * up, beside pages.
 */
export function ogImageResolver(src: string) {
  const files = new Map<string, Promise<boolean>>();
  const boundary =
    path.basename(src) === "pages" && path.basename(path.dirname(src)) === "src"
      ? path.dirname(src)
      : src;
  function exists(file: string) {
    let pending = files.get(file);
    if (!pending) {
      pending = stat(file).then(
        (info) => info.isFile(),
        (error: unknown) => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw error;
        },
      );
      files.set(file, pending);
    }
    return pending;
  }
  return async (source: SourceContext, meta: SsgMeta): Promise<string | undefined> => {
    if (meta.ogImage === false) return undefined;
    if (typeof meta.ogImage === "string") {
      const file = path.resolve(path.dirname(source.file), meta.ogImage);
      source.watch(file);
      return file;
    }
    // Custom discovery may return a source outside the discovery root.
    // Automatic lookup must not probe its unrelated ancestors; an explicit
    // meta.ogImage remains an intentional selection from the source file.
    const relative = path.relative(boundary, path.dirname(source.file));
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      return undefined;
    for (let directory = path.dirname(source.file); ; directory = path.dirname(directory)) {
      for (const extension of OG_IMAGE_EXTENSIONS) {
        const file = path.join(directory, `${OG_IMAGE_BASENAME}.${extension}`);
        source.watch(file);
        if (await exists(file)) return file;
      }
      if (directory === boundary || path.dirname(directory) === directory) return undefined;
    }
  };
}

/** Load and validate one `_og-image` module, with its fonts. Cached per loader. */
export function ogImageLoader() {
  const loaded = new WeakMap<ModuleLoader, Map<string, Promise<LoadedOgImage>>>();
  return (file: string, importSource: string, modules: ModuleLoader): Promise<LoadedOgImage> => {
    let cache = loaded.get(modules);
    if (!cache) loaded.set(modules, (cache = new Map()));
    const key = `${importSource}\0${file}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = modules.load(file, importSource).then(async (mod) => {
        const render = mod["default"];
        if (typeof render !== "function")
          throw failure(`Social card needs a default component: ${file}`, {
            reason: "OG_IMAGE_FAILED",
            hint: "Export a default function receiving { url, title, description, meta } and returning JSX from this _og-image file.",
            context: { file },
          });
        const size = readSize(mod["size"], file) ?? DEFAULT_SIZE;
        const variants: LoadedOgImage["variants"] = {};
        const declared = mod["variants"];
        if (declared !== undefined) {
          if (typeof declared !== "object" || declared === null || Array.isArray(declared))
            throw failure(`Social card variants must be an object: ${file}`, {
              reason: "OG_IMAGE_FAILED",
              hint: "Export variants as an object: { card: (context) => <…/> } or { card: { size, render } }.",
              context: { file },
            });
          for (const [name, variant] of Object.entries(declared as Record<string, unknown>)) {
            if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name))
              throw failure(`Invalid social card variant name "${name}": ${file}`, {
                reason: "OG_IMAGE_FAILED",
                hint: "Variant names become file names (og-<name>.png): use lowercase letters, digits and dashes.",
                context: { file, variant: name },
              });
            const entry =
              typeof variant === "function" ? { render: variant as OgImageRender } : variant;
            if (
              typeof entry !== "object" ||
              entry === null ||
              typeof (entry as { render?: unknown }).render !== "function"
            )
              throw failure(`Social card variant "${name}" needs a render function: ${file}`, {
                reason: "OG_IMAGE_FAILED",
                hint: "Each variant is a component function or { size, render }.",
                context: { file, variant: name },
              });
            const typed = entry as { render: OgImageRender; size?: unknown };
            variants[name] = { render: typed.render, size: readSize(typed.size, file) ?? size };
          }
        }
        const declaredFonts = mod["fonts"];
        const fontFiles: string[] = [];
        let fonts: LoadedOgImage["fonts"];
        if (declaredFonts === undefined) {
          fonts = await bundledFonts();
        } else {
          if (!Array.isArray(declaredFonts))
            throw failure(`Social card fonts must be an array: ${file}`, {
              reason: "OG_IMAGE_FAILED",
              hint: "Export fonts as [{ name, path, weight?, style? }]; paths resolve relative to the _og-image file.",
              context: { file },
            });
          fonts = await Promise.all(
            (declaredFonts as unknown[]).map(async (entry, index) => {
              const font = entry as Partial<OgImageFont> | null;
              if (typeof font?.name !== "string" || typeof font?.path !== "string")
                throw failure(`Invalid social card font at index ${index}: ${file}`, {
                  reason: "OG_IMAGE_FAILED",
                  hint: "Each font needs a name and a path to a TTF, OTF or WOFF/WOFF2 file.",
                  context: { file, index },
                });
              const resolved = path.resolve(path.dirname(file), font.path);
              fontFiles.push(resolved);
              let data: Buffer;
              try {
                data = await readFile(resolved);
              } catch (error) {
                throw failure(
                  `Social card font is not readable: ${resolved}`,
                  {
                    reason: "OG_IMAGE_FAILED",
                    hint: "Check the font path; it resolves relative to the _og-image file.",
                    context: { file, font: resolved },
                  },
                  error,
                );
              }
              return {
                name: font.name,
                data,
                weight: font.weight ?? 400,
                style: font.style ?? "normal",
              };
            }),
          );
          if (fonts.length === 0)
            throw failure(`Social card declares no fonts: ${file}`, {
              reason: "OG_IMAGE_FAILED",
              hint: "Provide at least one font, or remove the fonts export to use the bundled default.",
              context: { file },
            });
        }
        return { render: render as OgImageRender, variants, size, fonts, fontFiles };
      });
      cache.set(key, pending);
    }
    return pending;
  };
}

function readSize(value: unknown, file: string): OgImageSize | undefined {
  if (value === undefined) return undefined;
  const size = value as Partial<OgImageSize> | null;
  if (
    typeof size?.width !== "number" ||
    typeof size?.height !== "number" ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  )
    throw failure(`Invalid social card size: ${file}`, {
      reason: "OG_IMAGE_FAILED",
      hint: "Export size as { width, height } with positive pixel numbers, e.g. { width: 1200, height: 630 }.",
      context: { file },
    });
  return { width: size.width, height: size.height };
}

/**
 * Convert a Vincle VNode tree into the plain element tree the engine accepts.
 * Components run (sync or async); fragments flatten; raw HTML and deferred
 * templates have no meaning in an image and are refused with a fix hint.
 */
async function toElement(value: unknown, file: string): Promise<unknown> {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Promise) return toElement(await value, file);
  if (Array.isArray(value)) {
    const children: unknown[] = [];
    for (const child of value) {
      const converted = await toElement(child, file);
      if (converted !== null) children.push(converted);
    }
    return children;
  }
  if (typeof value === "object") {
    const node = value as {
      tag?: unknown;
      attrs?: Record<string, unknown>;
      children?: unknown;
      [Symbol.asyncIterator]?: unknown;
      [Symbol.iterator]?: unknown;
    };
    if (typeof node.tag === "string" || typeof node.tag === "function") {
      if (node.tag === Fragment) return toElement(node.children, file);
      if (typeof node.tag === "function") {
        const component = node.tag as (props: Record<string, unknown>) => unknown;
        let result: unknown;
        try {
          result = component(node.attrs ?? {});
        } catch (error) {
          throw failure(
            `Social card component failed: ${(component as { name?: string }).name || "anonymous"}`,
            {
              reason: "OG_IMAGE_FAILED",
              hint: "Fix the component; card components must be pure and stateless.",
              context: { file },
            },
            error,
          );
        }
        return toElement(result, file);
      }
      const tag = node.tag;
      const attrs = node.attrs ?? {};
      if (attrs["dangerouslySetInnerHTML"] !== undefined)
        throw failure(`Social cards cannot render raw HTML (<${tag}>): ${file}`, {
          reason: "OG_IMAGE_FAILED",
          hint: "Cards render to an image: use plain elements, text and style objects instead of dangerouslySetInnerHTML.",
          context: { file, tag },
        });
      const props: Record<string, unknown> = {};
      for (const [name, attr] of Object.entries(attrs)) if (name !== "children") props[name] = attr;
      const children = await toElement(node.children, file);
      if (children !== null) props["children"] = children;
      return { type: tag, props };
    }
    if (typeof node[Symbol.asyncIterator] === "function") {
      const items: unknown[] = [];
      for await (const item of value as AsyncIterable<unknown>) items.push(item);
      return toElement(items, file);
    }
    if (typeof node[Symbol.iterator] === "function")
      return toElement([...(value as Iterable<unknown>)], file);
    throw failure(`Unsupported value in a social card tree: ${file}`, {
      reason: "OG_IMAGE_FAILED",
      hint: "Cards render to an image: use plain elements, text, numbers and components; raw HTML and templates are not supported.",
      context: { file },
    });
  }
  throw failure(`Unsupported value in a social card tree: ${file}`, {
    reason: "OG_IMAGE_FAILED",
    hint: "Cards render to an image: use plain elements, text, numbers and components.",
    context: { file },
  });
}

/** Output path of one card, relative to dist: `<route>/og[-<name>].png`. */
export function ogImagePath(route: string, name?: string): string {
  const base = route.replace(/^\/+|\/+$/g, "");
  const file = name === undefined ? "og.png" : `og-${name}.png`;
  return base === "" ? file : `${base}/${file}`;
}

/** One page's card to render at publication time. */
export interface OgImageWork {
  file: string;
  module: LoadedOgImage;
  route: string;
  /** Shared page metadata; read at render time, once hooks have enriched it. */
  meta: SsgMeta;
  /** Set false when the page emits its own default og.png. */
  includeDefault?: boolean;
}

/** Render every pending card, reusing a content-hash cache across builds. */
export async function renderOgImages(
  work: readonly OgImageWork[],
  root: string,
  emit: (output: { path: string; content: Uint8Array }) => Promise<void>,
  concurrency = 4,
): Promise<void> {
  const file = work[0]?.file ?? "";
  satoriModule ??= loadEngine("satori", file);
  resvgModule ??= loadEngine("@resvg/resvg-js", file);
  const satori = (await satoriModule).default;
  const { Resvg } = await resvgModule;
  const cacheDirectory = path.join(root, "node_modules", ".cache", "vincle-og-images");
  const renderCard = async (
    item: OgImageWork,
    render: OgImageRender,
    size: OgImageSize,
    name: string | undefined,
  ) => {
    const context: OgImageContext = {
      url: item.route,
      title: item.meta.title,
      description: item.meta.description,
      meta: item.meta,
    };
    const element = await toElement(await render(context), item.file);
    // The engine needs one root element: wrap fragments and bare text.
    const card =
      typeof element === "object" && element !== null && "type" in element
        ? element
        : {
            type: "div",
            props: {
              style: { display: "flex", flexDirection: "column", width: "100%", height: "100%" },
              children: element,
            },
          };
    // Cache before the engine too: layout is the expensive step, so an
    // unchanged tree skips it entirely, not only the PNG encoding.
    const layoutKey = createHash("sha256")
      .update(CACHE_VERSION)
      .update("\0")
      .update(JSON.stringify(card))
      .update("\0")
      .update(`${size.width}x${size.height}`)
      .update("\0")
      .update(
        item.module.fonts
          .map((font) =>
            createHash("sha256")
              .update(font.name)
              .update("\0")
              .update(String(font.weight))
              .update("\0")
              .update(font.style)
              .update("\0")
              .update(font.data)
              .digest("hex"),
          )
          .join(","),
      )
      .digest("hex");
    const svg = await cachedText(cacheDirectory, layoutKey, async () =>
      satori(card, { width: size.width, height: size.height, fonts: item.module.fonts }),
    );
    const png = await cachedPng(cacheDirectory, svg, () =>
      // The layout already holds the text as outlines, so the system fonts
      // are never read; scanning them for every card costs ~70 ms each.
      new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng(),
    );
    await emit({ path: ogImagePath(item.route, name), content: png });
  };
  const tasks: Array<() => Promise<void>> = [];
  for (const item of work) {
    if (item.includeDefault !== false)
      tasks.push(() => renderCard(item, item.module.render, item.module.size, undefined));
    for (const [name, variant] of Object.entries(item.module.variants))
      tasks.push(() => renderCard(item, variant.render, variant.size, name));
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      let task: (() => Promise<void>) | undefined;
      while ((task = tasks[next++])) await task();
    }),
  );
}

/**
 * Content-addressed layout cache: the engine output is reused while the
 * converted tree, fonts, size and cache version stay identical. Same
 * best-effort contract as the PNG cache.
 */
async function cachedText(
  directory: string,
  key: string,
  render: () => Promise<string>,
): Promise<string> {
  const target = path.join(directory, `${key}.svg`);
  try {
    const cached = await readFile(target, "utf8");
    if (cached.startsWith("<svg")) return cached;
  } catch {
    // Cold cache or unreadable entry: render below.
  }
  const text = await render();
  try {
    await mkdir(directory, { recursive: true });
    const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temporary, text);
    await rename(temporary, target);
  } catch {
    // Caching is an optimization; the rendered card is still returned.
  }
  return text;
}

/**
 * Content-addressed PNG cache: the card only re-renders when its generated
 * markup changes, so incremental builds stay fast. Best-effort: a cache
 * failure never fails a build.
 */
async function cachedPng(
  directory: string,
  svg: string,
  render: () => Uint8Array,
): Promise<Uint8Array> {
  const key = createHash("sha256").update(CACHE_VERSION).update("\0").update(svg).digest("hex");
  const target = path.join(directory, `${key}.png`);
  try {
    const cached = await readFile(target);
    if (cached.length > 8 && cached[0] === 0x89 && cached[1] === 0x50) return cached;
  } catch {
    // Cold cache or unreadable entry: render below.
  }
  const png = render();
  try {
    await mkdir(directory, { recursive: true });
    const temporary = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temporary, png);
    await rename(temporary, target);
  } catch {
    // Caching is an optimization; the rendered card is still returned.
  }
  return png;
}
