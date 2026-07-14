/**
 * Vite asset integration for @vincle/core projects.
 *
 * In dev mode, Vite serves source files directly with HMR. In production,
 * Vite emits hashed bundle files described by a manifest at `.vite/manifest.json`.
 * This package lets a layout reference assets by their *source* path
 * (`src/main.ts`, `src/logo.svg`, `src/styles/main.css`) and resolves them
 * correctly in both modes:
 *
 * @example
 * import { Asset, assetUrl } from "@vincle/vite-plugin";
 *
 * <head>
 *   <Asset entry="src/styles/main.css" />
 *   <Asset entry="src/main.ts" />
 *   <link rel="icon" href={assetUrl("src/favicon.svg")} />
 * </head>
 * <img src={assetUrl("src/logo.png")} alt="logo" />
 *
 * @module
 */
import { context, setContext, useContext, type ContextKey, type VNode } from "@vincle/core";
import { readFile, access } from "node:fs/promises";

/** A single chunk in a Vite manifest. Mirrors `vite.ManifestChunk`. */
export interface ViteManifestChunk {
  file: string;
  src?: string;
  name?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  assets?: string[];
}

/** The shape of `.vite/manifest.json`. */
export type ViteManifest = Record<string, ViteManifestChunk>;

interface ViteScope {
  /** Production manifest, or `null` in dev mode. */
  manifest: ViteManifest | null;
  /** URL prefix prepended to every resolved asset path. Default: `"/"`. */
  base: string;
}

const ViteContext: ContextKey<ViteScope> = context<ViteScope>("@vincle/vite:scope");

/**
 * Load and parse a Vite manifest from disk. Returns `null` if the file does
 * not exist — that's how dev-mode setups signal "no manifest yet".
 *
 * @example
 * const manifest = await loadViteManifest("docs/assets/.vite/manifest.json");
 * // manifest is null in dev (file absent), the parsed object after `vite build`.
 */
export async function loadViteManifest(path: string): Promise<ViteManifest | null> {
  try {
    await access(path);
  } catch {
    return null;
  }
  const text = await readFile(path, "utf-8");
  return JSON.parse(text) as ViteManifest;
}

/**
 * Configure Vite asset resolution for the current render scope. Call once
 * before rendering, with the loaded manifest (production) or `null` (dev).
 */
export function setVite(manifest: ViteManifest | null, options?: { base?: string }): void {
  setContext(ViteContext, {
    manifest,
    base: options?.base ?? "/",
  });
}

/**
 * Resolve a Vite entry to its URL string. Use this to reference arbitrary
 * assets (images, fonts, favicons, …) inside attributes:
 *
 * @example
 * <img src={assetUrl("src/logo.png")} alt="logo" />
 * <link rel="icon" href={assetUrl("src/favicon.svg")} />
 * <link rel="preload" as="font" href={assetUrl("src/fonts/inter.woff2")} crossorigin />
 *
 * Dev mode: returns `{base}{entry}` (Vite serves the source directly).
 *
 * Production mode: looks up the entry in the manifest and returns
 * `{base}{chunk.file}` (the hashed output path). Throws if the entry is
 * not in the manifest.
 *
 * For the common CSS/JS case, prefer `<Asset entry="…" />`, which also emits
 * the necessary co-bundled CSS and `modulepreload` links.
 */
export function assetUrl(entry: string): string {
  return resolveUrl(useContext(ViteContext), entry);
}

function resolveUrl(scope: ViteScope, entry: string): string {
  if (scope.manifest === null) return `${scope.base}${entry}`;
  const chunk = scope.manifest[entry];
  if (!chunk) {
    throw new Error(
      `[vincle/vite-plugin] entry "${entry}" not found in manifest. Known entries: ${Object.keys(scope.manifest).join(", ")}`,
    );
  }
  return `${scope.base}${chunk.file}`;
}

/**
 * Resolve a Vite entry to the appropriate HTML tags. Reads the manifest from
 * the active render scope (set via `setVite`).
 *
 * Dev mode (`manifest === null`):
 * - `entry="path/to/file.css"` → `<link rel="stylesheet" href="{base}{entry}">`
 * - any other entry → `<script type="module" src="{base}{entry}">`
 *
 * The Vite HMR client (`/@vite/client`) is NOT emitted here — pipe the
 * rendered HTML through `server.transformIndexHtml()` to let Vite inject it
 * (and apply its other dev transforms). Any setup that doesn't go through
 * `transformIndexHtml` must add `<script type="module" src="/@vite/client">`
 * manually.
 *
 * Production mode (`manifest` provided):
 * - Looks up the entry in the manifest; throws if absent.
 * - Emits the resolved CSS as `<link rel="stylesheet">`.
 * - Emits `<link rel="modulepreload">` for each transitive JS import.
 * - Emits the entry itself as `<link rel="stylesheet">` (CSS entries) or
 *   `<script type="module">` (JS entries).
 *
 * For non-CSS/JS assets (images, fonts, favicons, …), use `assetUrl(entry)`
 * inside a tag you build yourself.
 */
export function Asset({ entry }: { entry: string }): any {
  const scope = useContext(ViteContext);
  return scope.manifest === null ? resolveDev(scope, entry) : resolveProd(scope, entry);
}

function resolveDev(scope: ViteScope, entry: string): VNode {
  const url = resolveUrl(scope, entry);
  if (entry.endsWith(".css")) return <link rel="stylesheet" href={url} />;
  return <script type="module" src={url}></script>;
}

function resolveProd(scope: ViteScope, entry: string): VNode {
  const manifest = scope.manifest!;
  const chunk = manifest[entry];
  if (!chunk) {
    throw new Error(
      `[vincle/vite-plugin] entry "${entry}" not found in manifest. Known entries: ${Object.keys(manifest).join(", ")}`,
    );
  }

  const out: VNode[] = [];
  const seen = new Set<string>();

  // Co-bundled CSS — render-blocking, must appear before scripts.
  for (const css of chunk.css ?? []) {
    out.push(<link rel="stylesheet" href={`${scope.base}${css}`} />);
  }

  // Transitive imports become modulepreload hints.
  visitImports(manifest, chunk, scope.base, seen, out);

  // The entry itself.
  const entryUrl = `${scope.base}${chunk.file}`;
  if (chunk.file.endsWith(".css")) {
    out.push(<link rel="stylesheet" href={entryUrl} />);
  } else {
    out.push(<script type="module" src={entryUrl}></script>);
  }
  return out;
}

function visitImports(
  manifest: ViteManifest,
  chunk: ViteManifestChunk,
  base: string,
  seen: Set<string>,
  out: VNode[],
): void {
  for (const importKey of chunk.imports ?? []) {
    if (seen.has(importKey)) continue;
    seen.add(importKey);
    const importedChunk = manifest[importKey];
    if (!importedChunk) continue;
    // Recurse first so deeper imports come before their dependents.
    visitImports(manifest, importedChunk, base, seen, out);
    for (const css of importedChunk.css ?? []) {
      out.push(<link rel="stylesheet" href={`${base}${css}`} />);
    }
    out.push(<link rel="modulepreload" href={`${base}${importedChunk.file}`} />);
  }
}
