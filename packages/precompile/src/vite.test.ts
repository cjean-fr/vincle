import { describe, it, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveConfig } from "vite";

import { type PluginConfig } from "./index.js";
import precompile from "./vite.js";

function errorCtx(): { error: (msg: string) => never } {
  return {
    error(msg: string): never {
      throw new Error(msg);
    },
  };
}

describe("the vite adapter", () => {
  async function callTransform(
    code: string,
    id: string,
    config?: PluginConfig,
    jsxImportSource?: string,
  ) {
    const plugin = precompile(config);
    const resolvedConfig = { esbuild: { jsxImportSource } };
    // @ts-expect-error: accessing internal Vite plugin lifecycle hooks that aren't on the public type
    plugin.configResolved?.(resolvedConfig);
    // @ts-expect-error: accessing internal Vite plugin transform hook
    return await plugin.transform!(code, id);
  }

  it("returns a Vite plugin object", async () => {
    const plugin = precompile();
    expect(plugin.name).toBe("@vincle/precompile");
    expect(plugin.enforce).toBe("pre");
    expect(typeof plugin.transform).toBe("function");
  });

  it("skips non-JSX files", async () => {
    const result = await callTransform('console.log("hello");', "/src/test.ts");
    expect(result).toBeUndefined();
  });

  it("skips node_modules", async () => {
    const result = await callTransform("<div>hello</div>", "/node_modules/foo/test.tsx");
    expect(result).toBeUndefined();
  });

  it("skips files without JSX", async () => {
    const result = await callTransform('const x = "no JSX here";', "/src/app.tsx");
    expect(result).toBeUndefined();
  });

  it("transforms JSX with default virtual runtime module", async () => {
    const code = `const x = <div class="foo">{name}</div>;`;
    const result = await callTransform(code, "/src/app.tsx");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("virtual:vincle-precompile-runtime");
    expect(result!.code).toContain("jsxTemplate");
    expect(result!.code).toContain("name");
  });

  it("uses explicit runtimeSource when provided", async () => {
    const code = `const x = <div>hello</div>;`;
    const result = await callTransform(code, "/src/app.tsx", {
      runtimeSource: "custom/jsx-runtime",
    });
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("custom/jsx-runtime");
  });

  it("falls back to the virtual runtime module when no runtimeSource given", async () => {
    const code = `const x = <div>hello</div>;`;
    const result = await callTransform(code, "/src/app.tsx", undefined, "preact");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("virtual:vincle-precompile-runtime");
  });

  it("prefers explicit runtimeSource over the default", async () => {
    const code = `const x = <div>hello</div>;`;
    const result = await callTransform(
      code,
      "/src/app.tsx",
      { runtimeSource: "custom/jsx-runtime" },
      "preact",
    );
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("custom/jsx-runtime");
    expect(result!.code).not.toContain("preact/jsx-runtime");
  });

  it("transforms JSX in .jsx files", async () => {
    const code = `const x = <div>hello</div>;`;
    const result = await callTransform(code, "/src/app.jsx");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("jsxTemplate");
  });

  it("uses the virtual runtime module even when esbuild.jsxImportSource is set", async () => {
    const code = `<div/>`;
    const result = await callTransform(code, "/src/a.tsx", undefined, "preact");
    expect(result!.code).toContain("virtual:vincle-precompile-runtime");
  });

  it("passes through sourcemap from transform", async () => {
    const result = await callTransform("<div>{name}</div>", "/src/app.tsx");
    expect(result).not.toBeUndefined();
    expect(result!.map).toBeDefined();
    expect(result!.map!.sources).toContain("/src/app.tsx");
  });

  it("precompiles a file whose pragma names a compatible runtime", async () => {
    const code = `/** @jsxImportSource preact */\nconst x = <div>hello</div>;`;
    const result = await callTransform(code, "/src/app.tsx");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("preact/jsx-runtime");
  });

  it("delegates when a file's pragma names an incompatible runtime", async () => {
    const code = `/** @jsxImportSource node:path */\nconst x = <div>hello</div>;`;
    const result = await callTransform(code, "/src/app.tsx");
    expect(result).toBeUndefined();
  });
  it("falls back to Deno's output when the runtime cannot be loaded", async () => {
    const plugin = precompile({
      runtimeSource: "totally-bogus-module-xyz",
    });
    // @ts-expect-error: calling internal hook with minimal config for testing
    plugin.configResolved.call({}, { esbuild: {} });
    const warnings: string[] = [];
    const ctx = {
      error(msg: string): never {
        throw new Error(msg);
      },
      warn(msg: string): void {
        warnings.push(msg);
      },
    };
    // @ts-expect-error: calling internal hook with a fake plugin context
    await plugin.buildStart.call(ctx);
    // Nothing to read means nothing to improve on, and the generated code
    // imports the helpers itself, so this is a warning, not a broken build.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not load");
    expect(warnings[0]).toContain("Deno's precompile transform");
  });

  /**
   * What the build does with a runtime it could read is decided by the dialect
   * that runtime declares, not by an option, and not by an inventory of its
   * exports. A foreign runtime is the normal case, not a failure; a runtime
   * claiming the `"vincle"` dialect without the helpers to back it is the
   * failure, because nothing else could produce the output it promises.
   */
  describe("what the declared dialect decides", () => {
    // A data: URL supplies the module, so no fixture file needs cleanup.
    const moduleOf = (source: string): string =>
      `data:text/javascript,${encodeURIComponent(source)}`;

    const buildWith = async (source: string): Promise<{ error?: string; warnings: string[] }> => {
      const plugin = precompile({ runtimeSource: moduleOf(source) });
      // @ts-expect-error: calling internal hook with minimal config for testing
      plugin.configResolved.call({}, { esbuild: {} });
      const warnings: string[] = [];
      const ctx = {
        error(msg: string): never {
          throw new Error(msg);
        },
        warn(msg: string): void {
          warnings.push(msg);
        },
      };
      try {
        // @ts-expect-error: calling internal hook with a fake plugin context
        await plugin.buildStart.call(ctx);
        return { warnings };
      } catch (err) {
        return { error: (err as Error).message, warnings };
      }
    };

    it("takes a foreign runtime as it is, silently", async () => {
      // No dialect declared: Deno's output, which is what its helpers expect.
      // Not a warning either: this is the documented majority case.
      const { error, warnings } = await buildWith(`export const jsxTemplate = () => "";`);
      expect(error).toBeUndefined();
      expect(warnings).toEqual([]);
    });

    it("refuses a runtime that claims the dialect without the helpers", async () => {
      const { error, warnings } = await buildWith(
        [
          `export const precompileDialect = "vincle";`,
          `export const jsxTemplate = () => "";`,
          `export const jsxAttr = (n, v) => ({ value: v == null ? "" : n + '="' + v + '"' });`,
        ].join("\n"),
      );
      expect(error).toContain('declares the "vincle" precompile dialect');
      expect(error).toContain("jsxEscape");
      expect(error).not.toContain("could not load");
      expect(warnings).toEqual([]);
    });

    it("accepts a runtime that declares it and backs it", async () => {
      const { error, warnings } = await buildWith(
        [
          `export const precompileDialect = "vincle";`,
          `export const jsxTemplate = () => "";`,
          `export const jsxAttr = (n, v) => ({ value: v == null ? "" : n + '="' + v + '"' });`,
          `export const jsxEscape = (v) => ({ value: v == null ? "" : String(v) });`,
        ].join("\n"),
      );
      expect(error).toBeUndefined();
      expect(warnings).toEqual([]);
    });
  });

  describe("runtime probe", () => {
    const RID = "\0virtual:vincle-precompile-runtime";

    it("uses preact/jsx-runtime when jsxImportSource is preact (compatible)", async () => {
      const plugin = precompile();
      // @ts-expect-error: internal hook
      plugin.configResolved({ esbuild: { jsxImportSource: "preact" } });
      // @ts-expect-error: internal hook
      await plugin.buildStart.call(errorCtx());
      // @ts-expect-error: internal hook
      const vm = plugin.load(RID);
      expect(vm).toContain("preact/jsx-runtime");
    });

    it("throws when jsxImportSource module has no jsxTemplate export", async () => {
      const plugin = precompile();
      // node:path/jsx-runtime doesn't exist → import fails → error
      // @ts-expect-error: internal hook
      plugin.configResolved({ esbuild: { jsxImportSource: "node:path" } });
      // @ts-expect-error: internal hook
      await expect(plugin.buildStart.call(errorCtx())).rejects.toThrow(/failed to probe/);
    });

    it("defaults to @vincle/core/jsx-runtime when no jsxImportSource is set", async () => {
      const plugin = precompile();
      // @ts-expect-error: internal hook
      plugin.configResolved({ esbuild: {} });
      // @ts-expect-error: internal hook
      await plugin.buildStart.call(errorCtx());
      // @ts-expect-error: internal hook
      const vm = plugin.load(RID);
      expect(vm).toContain("@vincle/core/jsx-runtime");
    });

    // The two halves of the default path are written in different files: the
    // transform decides which helpers the output imports, the virtual module
    // decides which ones it re-exports. Nothing compared them, and a helper
    // added on one side only is a build that fails with "not exported by": for
    // every app that does not set `runtimeSource`.
    it("re-exports every helper the transform can emit", async () => {
      const shapes = [
        'export const a = <a href={url} class="c">{text}</a>;',
        "export const b = <div><style>{css}</style><script>{code}</script></div>;",
        "export const c = <ul>{items.map((i) => <li>{i}</li>)}</ul>;",
        "export const d = <div><img>{alt}</img><br /><Comp x={1} /></div>;",
        "export const e = <>{one}<b>two</b></>;",
      ];

      for (const compatibility of [true, false]) {
        const plugin = precompile();
        // @ts-expect-error: internal hook
        plugin.configResolved({ esbuild: {} });
        // @ts-expect-error: internal hook
        await plugin.buildStart.call(errorCtx());
        // @ts-expect-error: internal hook
        expect(plugin.load(RID)).toContain('export * from "@vincle/core/jsx-runtime"');
        const reExported = new Set([
          "jsx",
          "jsxTemplate",
          "jsxTemplateDeferred",
          "jsxAttr",
          "jsxEscape",
          "jsxEscapeDeferred",
        ]);

        for (const code of shapes) {
          // @ts-expect-error: internal hook
          const out = (await plugin.transform.call({}, code, "/src/app.tsx")) as {
            code: string;
          } | null;
          if (!out) continue;
          const imported = named(out.code, /import \{([^}]*)\} from/);
          expect(imported).not.toEqual([]);
          expect(
            imported.filter((h) => !reExported.has(h)),
            `${code} (compatibility: ${compatibility})`,
          ).toEqual([]);
        }
      }
    });
  });

  describe("runtime detection with the real Vite 8 resolved config", () => {
    const buildFromConfig = async (config: Record<string, unknown>) => {
      const root = await mkdtemp(path.join(tmpdir(), "vincle-precompile-vite-"));
      await writeFile(
        path.join(root, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { jsxImportSource: "preact" } }),
      );
      try {
        const resolved = await resolveConfig(
          { root, configFile: false, logLevel: "silent", ...config },
          "build",
        );
        const plugin = precompile();
        // @ts-expect-error: invoking a lifecycle hook directly with a test context
        plugin.configResolved(resolved);
        const warnings: string[] = [];
        const ctx = {
          error(msg: string): never {
            throw new Error(msg);
          },
          warn(msg: string): void {
            warnings.push(msg);
          },
        };
        // @ts-expect-error: same
        await plugin.buildStart.call(ctx);
        // @ts-expect-error: same
        plugin.transform.call(ctx, "export const x = <p>hi</p>;", "/app/a.tsx");
        let buildError: string | undefined;
        try {
          // @ts-expect-error: same
          plugin.buildEnd.call(ctx);
        } catch (error) {
          buildError = (error as Error).message;
        }
        // @ts-expect-error: same
        const runtime = plugin.load("\0virtual:vincle-precompile-runtime") as string;
        return { runtime, warnings, buildError };
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    };

    it("reads oxc.jsx.importSource", async () => {
      const { runtime, buildError } = await buildFromConfig({
        oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
      });
      expect(runtime).toContain("preact/jsx-runtime");
      expect(buildError).toBeUndefined();
    });

    it("reads esbuild.jsxImportSource once Vite converted it to oxc", async () => {
      const { runtime, buildError } = await buildFromConfig({
        esbuild: { jsx: "automatic", jsxImportSource: "preact" },
      });
      expect(runtime).toContain("preact/jsx-runtime");
      expect(buildError).toBeUndefined();
    });

    it("prefers oxc over esbuild", async () => {
      const { runtime, buildError } = await buildFromConfig({
        oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
        esbuild: { jsx: "automatic", jsxImportSource: "other" },
      });
      expect(runtime).toContain("preact/jsx-runtime");
      expect(buildError).toBeUndefined();
    });

    it("does not infer from esbuild.jsxImportSource when Vite 8 ignores it", async () => {
      const { runtime, buildError } = await buildFromConfig({
        esbuild: { jsxImportSource: "preact" },
      });
      expect(runtime).toContain("@vincle/core/jsx-runtime");
      expect(buildError).toContain("no JSX runtime source was detected");
    });

    it("does not infer from a disabled, preserved, classic or empty oxc config", async () => {
      for (const config of [
        { oxc: false },
        { oxc: { jsx: "preserve" } },
        { oxc: { jsx: { runtime: "classic", importSource: "preact" } } },
        { oxc: { jsx: { runtime: "automatic", importSource: "" } } },
      ]) {
        const { runtime, buildError } = await buildFromConfig(config);
        expect(runtime, JSON.stringify(config)).toContain("@vincle/core/jsx-runtime");
        expect(buildError, JSON.stringify(config)).toContain("no JSX runtime source was detected");
      }
    });

    it("does not infer a runtime from tsconfig alone", async () => {
      const { runtime, buildError } = await buildFromConfig({});
      expect(runtime).toContain("@vincle/core/jsx-runtime");
      expect(buildError).toContain("no JSX runtime source was detected");
    });

    it("falls back to esbuild only on a Vite whose resolved config has no oxc", async () => {
      const plugin = precompile();
      // @ts-expect-error: a Vite 5-7 resolved config, before the oxc option existed
      plugin.configResolved({ command: "build", esbuild: { jsxImportSource: "preact" } });
      const warnings: string[] = [];
      const ctx = {
        error(msg: string): never {
          throw new Error(msg);
        },
        warn(msg: string): void {
          warnings.push(msg);
        },
      };
      // @ts-expect-error: same
      await plugin.buildStart.call(ctx);
      // @ts-expect-error: same
      expect(plugin.load("\0virtual:vincle-precompile-runtime")).toContain("preact/jsx-runtime");
      // @ts-expect-error: same
      plugin.transform.call(ctx, "export const x = <p>hi</p>;", "/app/a.tsx");
      // @ts-expect-error: same
      expect(() => plugin.buildEnd.call(ctx)).not.toThrow();
      expect(warnings).toEqual([]);
    });
  });
});

/** The names inside the first `{…}` group matched by `re`, sorted. */
function named(code: string, re: RegExp): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(new RegExp(re, "g"))) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim();
      if (name) out.add(name);
    }
  }
  return [...out].toSorted();
}

describe("plugin config", () => {
  it("rejects a non-string runtimeSource at plugin creation", async () => {
    expect(() => precompile({ runtimeSource: 42 as never })).toThrow(
      "[vincle/precompile] config: runtimeSource must be a non-empty string module",
    );
  });

  it("rejects an empty runtimeSource at plugin creation", async () => {
    expect(() => precompile({ runtimeSource: "" })).toThrow(
      "[vincle/precompile] config: runtimeSource must be a non-empty string module",
    );
  });

  it("accepts a valid config", async () => {
    const plugin = precompile({
      runtimeSource: "@vincle/core/jsx-precompile-runtime",
    });
    expect(plugin.name).toBe("@vincle/precompile");
  });
});

// A build that never reached the transform renders the same document as one that
// did: the warning is the only way that shows.
describe("declared but never applied", () => {
  function build(config?: PluginConfig) {
    const plugin = precompile(config);
    const warnings: string[] = [];
    // @ts-expect-error: Vite plugin lifecycle hooks are not on the public type
    plugin.configResolved?.({ command: "build", esbuild: {} });
    return {
      transform: (code: string, id: string) =>
        // @ts-expect-error: same
        plugin.transform!.call({ warn: () => {} }, code, id),
      end: () => {
        // @ts-expect-error: same
        plugin.buildEnd!.call({
          warn: (m: string) => warnings.push(m),
          error: (m: string): never => {
            throw new Error(m);
          },
        });
        return warnings;
      },
    };
  }

  it("warns when no JSX module went through Vite", async () => {
    const b = build({ runtimeSource: "@vincle/core/jsx-precompile-runtime" });
    b.transform("export const a = 1;", "/app/client.ts");
    const [warning] = b.end();
    expect(warning).toContain("nothing was precompiled in this build");
    expect(warning).toContain("no .jsx/.tsx module passed through it at all");
  });

  it("says so when JSX modules passed but held no JSX", async () => {
    const b = build({ runtimeSource: "@vincle/core/jsx-precompile-runtime" });
    b.transform("export const a = 1;", "/app/thing.tsx");
    const [warning] = b.end();
    expect(warning).toContain("1 .jsx/.tsx module(s) passed through it");
  });

  it("does not mistake less-than operators or '<' strings for JSX", async () => {
    for (const code of [
      "export const a = b < c;",
      'export const a = "<b>";',
      "export const a = 1;",
    ]) {
      const b = build();
      b.transform(code, "/app/thing.tsx");
      expect(() => b.end(), code).not.toThrow();
    }
  });

  it("fails when genuine host or component JSX has no detectable runtime", async () => {
    for (const code of ["export const a = <p>hi</p>;", "export const a = <Comp />;"]) {
      const b = build();
      b.transform(code, "/app/thing.tsx");
      expect(() => b.end(), code).toThrow("no JSX runtime source was detected");
    }
  });

  it("stays quiet once a module has been precompiled", async () => {
    const b = build({ runtimeSource: "@vincle/core/jsx-precompile-runtime" });
    b.transform("export const a = <div>x</div>;", "/app/page.tsx");
    expect(b.end()).toEqual([]);
  });

  it("stays quiet in dev, where the hook fires at server close", async () => {
    const plugin = precompile({ runtimeSource: "@vincle/core/jsx-precompile-runtime" });
    const warnings: string[] = [];
    // @ts-expect-error: Vite plugin lifecycle hooks are not on the public type
    plugin.configResolved?.({ command: "serve", esbuild: {} });
    // @ts-expect-error: same
    plugin.buildEnd!.call({ warn: (m: string) => warnings.push(m) });
    expect(warnings).toEqual([]);
  });
});
