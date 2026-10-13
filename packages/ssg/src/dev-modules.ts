import { stat } from "node:fs/promises";
import path from "node:path";
import { isRunnableDevEnvironment, type Plugin, type ViteDevServer } from "vite";

import type { ModuleLoader } from "./types.js";

import { diagnose, failure } from "./errors.js";

export function developmentModules(importSource: string, sourceDirectory: string) {
  const compiled = new Map<string, string>();
  const watched = new Set<string>();
  const originals = new Set<string>();
  const forgotten = new Set<unknown>();
  const stamps = new Map<string, string>();
  let server: ViteDevServer;
  let generation = 0;
  const plugin: Plugin = {
    name: "vincle-ssg-development-modules",
    enforce: "pre",
    configureServer(value) {
      server = value;
      generation++;
      if (watched.size) value.watcher.add([...watched]);
    },
    resolveId(id) {
      if (compiled.has(id)) return id;
      return undefined;
    },
    load(id) {
      if (compiled.has(id)) {
        this.addWatchFile(id.slice(0, -".vincle-compiled.js".length));
        return compiled.get(id);
      }
      return undefined;
    },
  };
  function environment() {
    const value = server.environments["ssr"];
    if (!value || !isRunnableDevEnvironment(value))
      throw failure("Vite has no runnable development SSR environment.", {
        reason: "COMPILATION_FAILED",
        hint: "Configure a Node-compatible ssr environment for the development module runner.",
        context: { phase: "dev" },
      });
    return value;
  }
  function invalidate(id: string) {
    const env = environment();
    const mod = env.moduleGraph.getModuleById(id);
    if (mod) env.moduleGraph.invalidateModule(mod);
    const evaluated = env.runner.evaluatedModules;
    const seen = new Set<string>();
    const visit = (key: string) => {
      if (seen.has(key)) return;
      seen.add(key);
      const node = evaluated.getModuleById(key);
      if (!node) return;
      for (const importer of node.importers) visit(importer);
      evaluated.invalidateModule(node);
    };
    visit(id);
  }
  // Vite invalidates deleted files but deliberately retains their graph nodes.
  // Drop only deleted source nodes and their stable MDX companions, not live modules.
  function forget(id: string) {
    const env = environment();
    invalidate(id);
    const node = env.moduleGraph.getModuleById(id);
    if (node) {
      forgotten.add(node);
      for (const dependency of node.importedModules) dependency.importers.delete(node);
      for (const importer of node.importers) {
        importer.importedModules.delete(node);
        importer.acceptedHmrDeps.delete(node);
      }
      for (const [key, value] of env.moduleGraph.urlToModuleMap)
        if (value === node) env.moduleGraph.urlToModuleMap.delete(key);
      env.moduleGraph.idToModuleMap.delete(id);
      if (node.file) {
        const siblings = env.moduleGraph.fileToModulesMap.get(node.file);
        siblings?.delete(node);
        if (!siblings?.size) env.moduleGraph.fileToModulesMap.delete(node.file);
      }
    }
    const graph = env.runner.evaluatedModules;
    const evaluated = graph.getModuleById(id);
    if (evaluated) {
      // Invalidation clears imports, so also remove obsolete reverse edges.
      for (const module of graph.idToModuleMap.values()) {
        module.importers.delete(id);
        module.imports.delete(id);
      }
      graph.idToModuleMap.delete(id);
      for (const [key, value] of graph.urlToIdModuleMap)
        if (value === evaluated) graph.urlToIdModuleMap.delete(key);
      for (const [file, modules] of graph.fileToModulesMap) {
        modules.delete(evaluated);
        if (!modules.size) graph.fileToModulesMap.delete(file);
      }
    }
  }
  const modules: ModuleLoader = {
    watchFile(file) {
      if (!watched.has(file)) server.watcher.add(file);
      watched.add(file);
    },
    async load(file, source, code) {
      if (source !== importSource)
        throw failure("The page runtime differs from the development runtime.", {
          reason: "INVALID_CONFIG",
          hint: "Use the same runtime.importSource for all handlers and layouts.",
          context: { file, importSource: source, expected: importSource },
        });
      const id = code === undefined ? file : `${file}.vincle-compiled.js`;
      if (code !== undefined) {
        originals.add(file);
        if (compiled.get(id) !== code) {
          compiled.set(id, code);
          invalidate(id);
        }
      }
      return diagnose(
        () => environment().runner.import<Record<string, unknown>>(id),
        "Could not evaluate development source",
        {
          reason: "COMPILATION_FAILED",
          hint: "Check this source and its imports, aliases and serve plugins. The original Vite error is included in cause.",
          context: { file, phase: "dev" },
        },
      );
    },
  };
  async function refresh() {
    const env = environment();
    const changed = new Set<string>();
    const files = new Set([...env.moduleGraph.fileToModulesMap.keys(), ...originals, ...watched]);
    await Promise.all(
      [...files].map(async (file) => {
        if (compiled.has(file) || file.includes("/node_modules/")) return;
        let stamp = "missing";
        try {
          const info = await stat(file);
          stamp = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (stamps.has(file) && stamps.get(file) !== stamp) changed.add(file);
        if (stamp === "missing") {
          for (const node of env.moduleGraph.getModulesByFile(file) ?? [])
            if (node.id) forget(node.id);
          for (const node of env.runner.evaluatedModules.getModulesByFile(file) ?? [])
            forget(node.id);
          if (originals.delete(file)) {
            const id = `${file}.vincle-compiled.js`;
            forget(id);
            compiled.delete(id);
          }
          if (watched.has(file)) stamps.set(file, stamp);
          else stamps.delete(file);
          return;
        }
        if (stamps.has(file) && stamps.get(file) !== stamp) {
          for (const node of env.moduleGraph.getModulesByFile(file) ?? [])
            if (node.id) invalidate(node.id);
          if (originals.has(file)) invalidate(`${file}.vincle-compiled.js`);
        }
        stamps.set(file, stamp);
      }),
    );
    if (forgotten.size) {
      // Vite 8 also memoizes raw URLs as promises of nodes. Public graph maps
      // alone cannot release deleted nodes or correctly resolve recreated files.
      const cache: unknown = Reflect.get(env.moduleGraph, "_unresolvedUrlToModuleMap");
      if (!(cache instanceof Map))
        throw failure("The Vite module graph cannot release deleted source nodes.", {
          reason: "COMPILATION_FAILED",
          hint: "Use a supported Vite 8 version; the development graph cleanup adapter must match Vite's raw URL cache.",
          context: { phase: "dev" },
        });
      await Promise.all(
        [...cache].map(async ([key, value]) => {
          try {
            if (forgotten.has(await value)) cache.delete(key);
          } catch {
            cache.delete(key);
          }
        }),
      );
      forgotten.clear();
    }
    return changed;
  }
  function dependencies(file: string) {
    const graph = environment().moduleGraph;
    const files = new Set<string>([file]);
    const seen = new Set<unknown>();
    const visit = (node: NonNullable<ReturnType<typeof graph.getModuleById>>) => {
      if (seen.has(node)) return;
      seen.add(node);
      if (node.file)
        files.add(
          node.file.endsWith(".vincle-compiled.js")
            ? node.file.slice(0, -".vincle-compiled.js".length)
            : node.file,
        );
      for (const dependency of node.importedModules) visit(dependency);
    };
    const node = graph.getModuleById(file) ?? graph.getModuleById(`${file}.vincle-compiled.js`);
    if (node) visit(node);
    const evaluated = environment().runner.evaluatedModules;
    const evaluatedSeen = new Set<string>();
    const collect = (id: string) => {
      if (evaluatedSeen.has(id)) return;
      evaluatedSeen.add(id);
      const current = evaluated.getModuleById(id);
      if (!current) return;
      if (path.isAbsolute(current.file))
        files.add(
          current.file.endsWith(".vincle-compiled.js")
            ? current.file.slice(0, -".vincle-compiled.js".length)
            : current.file,
        );
      for (const dependency of current.imports) collect(dependency);
    };
    collect(file);
    collect(`${file}.vincle-compiled.js`);
    return files;
  }
  return {
    plugin,
    get generation() {
      return generation;
    },
    modules,
    refresh,
    dependencies,
    async setWatched(files: Iterable<string>) {
      const next = new Set(files);
      const inside = (file: string, directory: string) =>
        file === directory || file.startsWith(directory + path.sep);
      const stale = [...watched].filter(
        (file) =>
          !next.has(file) &&
          !inside(file, server.config.root) &&
          !inside(file, sourceDirectory) &&
          !environment().moduleGraph.getModulesByFile(file) &&
          ![...next].some((dependency) => inside(dependency, file)),
      );
      if (stale.length) await server.watcher.unwatch(stale);
      watched.clear();
      for (const file of next) watched.add(file);
      for (const file of stamps.keys())
        if (!watched.has(file) && !environment().moduleGraph.getModulesByFile(file))
          stamps.delete(file);
    },
    dispose() {
      watched.clear();
      compiled.clear();
      originals.clear();
      stamps.clear();
      forgotten.clear();
    },
  };
}
