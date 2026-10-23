import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

import type {
  AssetBuild,
  AssetContext,
  AssetIntegration,
  JsxRuntime,
  ModuleLoader,
  SsgOptions,
} from "./types.js";

import { clientEntries } from "./conventions.js";
import { failure, diagnose } from "./errors.js";

/** Internal dev state: one asset session per dev() call. */
export interface AssetSession {
  /** Integrations resolved once at dev startup, in declaration order. */
  integrations: readonly AssetIntegration[];
  /** Stable directory receiving one subdirectory per integration declaring dev. */
  directory: string;
  /** Development module loader; it replaces integration providers. */
  modules?: ModuleLoader;
  /** dev() builds memoized once per session, keyed by integration position. */
  prepared: Map<number, AssetBuild>;
  /** Receives resolved `watch` paths, idempotently, for the dev server watcher. */
  watch(files: readonly string[]): void;
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

/** Normalize SsgOptions.assets into the canonical integration list, before any side effect. */
export async function resolveAssetIntegrations(
  assets: SsgOptions["assets"],
  root: string,
  src: string,
): Promise<readonly AssetIntegration[]> {
  if (assets === false) return [];
  if (assets === undefined) {
    const conventional = await conventionalAssets(root, src);
    return conventional ? [conventional] : [];
  }
  const integrations: readonly AssetIntegration[] = Array.isArray(assets) ? assets : [assets];
  for (const [index, integration] of integrations.entries())
    if (typeof integration?.prepare !== "function")
      throw failure(`Asset integration #${index + 1} has no prepare() function.`, {
        reason: "INVALID_CONFIG",
        hint: "Set assets to a single AssetIntegration, an array of asset integrations, or false.",
        context: { phase: "assets", integration: index + 1 },
      });
  return integrations;
}

function invalidBuild(index: number, summary: string, hint: string): never {
  throw failure(summary, {
    reason: "INVALID_CONFIG",
    hint,
    context: { phase: "assets", integration: index + 1 },
  });
}

/** Reject a malformed build before its directory is copied or its files are watched. */
function validateBuild(build: AssetBuild, index: number): void {
  if (typeof build?.directory !== "string" || build.directory === "")
    invalidBuild(
      index,
      `Asset integration #${index + 1} returned no directory.`,
      "Return { directory } from prepare() and dev().",
    );
  for (const entry of build.watch ?? [])
    if (typeof entry !== "string" || entry === "")
      invalidBuild(
        index,
        `Asset integration #${index + 1} declares an invalid watch path.`,
        "Declare watch as non-empty relative or absolute file paths.",
      );
}

/**
 * Prepare every integration in declaration order, each in its own directory. Session
 * builds run `dev()` once and are owned by the session; build-only preparations are
 * released by the caller. A failure releases the builds already prepared here.
 */
export async function prepareAssets(preparation: {
  /** Declared assets; ignored when a development session already resolved them. */
  assets: SsgOptions["assets"];
  root: string;
  src: string;
  runtime: JsxRuntime;
  base?: string;
  /** Parent directory receiving one preparation subdirectory per integration. */
  work: string;
  session?: AssetSession;
}): Promise<{
  builds: readonly AssetBuild[];
  /** true = session-owned build, never disposed by this build. */
  owned: readonly boolean[];
  modules?: ModuleLoader;
}> {
  const { assets, root, src, runtime, base, work, session } = preparation;
  // A development session resolved the integrations once, at startup: rebuilding
  // must reuse those identities, not re-run conventional detection.
  const integrations = session
    ? session.integrations
    : await resolveAssetIntegrations(assets, root, src);
  const builds: AssetBuild[] = [];
  const owned: boolean[] = [];
  // The container exists before prepare; each integration owns its own subdirectory.
  if (session) await mkdir(session.directory, { recursive: true });
  await mkdir(work, { recursive: true });
  try {
    for (const [index, integration] of integrations.entries()) {
      const cached = integration.dev ? session?.prepared.get(index) : undefined;
      if (cached) {
        // Reuse the session build: dev() ran once for this session.
        builds.push(cached);
        owned.push(true);
        continue;
      }
      const development = integration.dev !== undefined && session !== undefined;
      const context: AssetContext = {
        root,
        src,
        out: path.join(development ? session!.directory : work, String(index)),
        runtime,
        base,
      };
      const build = await diagnose(
        async () =>
          development ? await integration.dev!(context) : await integration.prepare(context),
        development
          ? `Could not prepare development asset integration #${index + 1}`
          : `Could not prepare asset integration #${index + 1}`,
        {
          reason: "ASSETS_FAILED",
          hint: "Check this asset integration's configuration and the original cause. Fix the failing entry/import or filesystem operation before rebuilding.",
          context: {
            root,
            src,
            out: context.out,
            phase: "assets",
            integration: index + 1,
            integrations: integrations.length,
          },
        },
      );
      builds.push(build);
      owned.push(development);
      try {
        validateBuild(build, index);
      } catch (error) {
        // A session build is never memoized, so an invalid one must be released here:
        // the outer catch only disposes builds this call owns.
        if (development)
          try {
            await build.dispose?.();
          } catch {
            // The original validation error is the failure worth reporting.
          }
        throw error;
      }
      // A failed dev() is never memoized, so the next rebuild retries it.
      if (development) session!.prepared.set(index, build);
      if (session && build.watch?.length)
        session.watch(build.watch.map((entry) => path.resolve(root, entry)));
    }
    const providers = builds.flatMap((build, index) => (build.modules ? [index] : []));
    if (providers.length > 1)
      throw failure(
        `Multiple asset integrations provide modules (${providers.map((index) => `#${index + 1}`).join(", ")}).`,
        {
          reason: "INVALID_CONFIG",
          hint: "Declare modules on one asset integration only: discovery and rendering share a single source module graph.",
          context: { phase: "assets", integrations: builds.length },
        },
      );
    // The incremental development compiler always wins over integration providers.
    const modules = session
      ? session.modules
      : providers.length === 1
        ? builds[providers[0]!]!.modules
        : undefined;
    return { builds, owned, ...(modules ? { modules } : {}) };
  } catch (error) {
    await disposeBuilds(builds.filter((_, index) => !owned[index]));
    throw error;
  }
}

/** Chain integration render wrappers: the first declared integration is the innermost. */
export function assetRuntime(runtime: JsxRuntime, builds: readonly AssetBuild[]): JsxRuntime {
  let chain = runtime;
  for (const build of builds) {
    const render = build.render?.bind(build);
    if (!render) continue;
    const inner = chain;
    chain = { ...runtime, render: (create) => render(inner, create) };
  }
  return chain;
}

/** Dispose in reverse declaration order, always attempting every build; returns the first error. */
export async function disposeBuilds(builds: readonly AssetBuild[]): Promise<unknown> {
  let first: unknown;
  for (const build of builds.toReversed()) {
    try {
      await build.dispose?.();
    } catch (error) {
      first ??= error;
    }
  }
  return first;
}
