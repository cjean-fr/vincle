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
import {
  context,
  setContext,
  useContext,
  jsxs,
  Fragment,
  type ContextKey,
  type JSX,
} from "@vincle/core";
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
 * A file that exists but does not hold a Vite manifest is a configuration
 * problem, not a "dev mode" signal — it throws, naming the file.
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
  let text: string;
  try {
    text = await readFile(path, "utf-8");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[vincle/vite-plugin] loadViteManifest: could not read the manifest at "${path}" — ${reason}. ` +
        "Check the path points at the file `vite build` wrote (.vite/manifest.json by default).",
      { cause: err },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[vincle/vite-plugin] loadViteManifest: the manifest at "${path}" is not valid JSON — ${reason}. ` +
        "Re-run `vite build`; the file may be stale or truncated.",
      { cause: err },
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `[vincle/vite-plugin] loadViteManifest: the manifest at "${path}" must be a JSON object ` +
        `mapping source entries to chunks, got ${Array.isArray(parsed) ? "an array" : JSON.stringify(parsed)}. ` +
        "Re-run `vite build`; the file may be stale or truncated.",
    );
  }
  return parsed as ViteManifest;
}

/**
 * Configure Vite asset resolution for the current render scope. Call once
 * before rendering, with the loaded manifest (production) or `null` (dev).
 */
export function setVite(manifest: ViteManifest | null, options?: { base?: string }): void {
  if (options?.base !== undefined && typeof options.base !== "string") {
    throw new Error(
      `[vincle/vite-plugin] setVite: base must be a string URL prefix, e.g. { base: "/cdn/" }, ` +
        `got ${typeof options.base}. Omit it to use the default "/".`,
    );
  }
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

/**
 * One message for both resolution paths (`assetUrl`, `<Asset>`), so the
 * precompile and component routes can never drift apart on what a missing
 * entry means. Suggests the closest known entry when one is near.
 */
function missingEntryMessage(entry: string, manifest: ViteManifest): string {
  const keys = Object.keys(manifest);
  const near = suggestEntry(entry, keys);
  return (
    `[vincle/vite-plugin] Vite entry "${entry}" not found in manifest. ` +
    (near ? `Did you mean "${near}"? ` : "") +
    "The manifest only lists files Vite bundles — the file must be imported by (or referenced from) " +
    "an entry point, and the manifest must be current (re-run `vite build`). " +
    `Known entries: ${keys.length > 0 ? keys.join(", ") : "(none)"}.`
  );
}

/** Closest manifest key by edit distance, when it is close enough to be a typo. */
function suggestEntry(entry: string, keys: string[]): string | null {
  const lower = entry.toLowerCase();
  const caseMatch = keys.find((k) => k.toLowerCase() === lower);
  if (caseMatch) return caseMatch;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const key of keys) {
    const d = levenshtein(lower, key.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = key;
    }
  }
  const limit = Math.max(2, Math.floor(entry.length * 0.25));
  return best !== null && bestDist <= limit ? best : null;
}

function levenshtein(a: string, b: string): number {
  // Classic two-row DP. Cold path only — it runs to build an error message.
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev: number[] = [];
  let curr: number[] = [];
  for (let j = 0; j <= n; j++) prev.push(j);
  for (let i = 1; i <= m; i++) {
    curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr.push(Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost));
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

function resolveUrl(scope: ViteScope, entry: string): string {
  if (scope.manifest === null) return `${scope.base}${entry}`;
  const chunk = scope.manifest[entry];
  if (!chunk) {
    throw new Error(missingEntryMessage(entry, scope.manifest));
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

function resolveDev(scope: ViteScope, entry: string): JSX.Element {
  const url = resolveUrl(scope, entry);
  if (entry.endsWith(".css")) return <link rel="stylesheet" href={url} />;
  return <script type="module" src={url}></script>;
}

function resolveProd(scope: ViteScope, entry: string): JSX.Element {
  const manifest = scope.manifest!;
  const chunk = manifest[entry];
  if (!chunk) {
    throw new Error(missingEntryMessage(entry, manifest));
  }

  const out: JSX.Element[] = [];
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
  return jsxs(Fragment, { children: out });
}

function visitImports(
  manifest: ViteManifest,
  chunk: ViteManifestChunk,
  base: string,
  seen: Set<string>,
  out: JSX.Element[],
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
