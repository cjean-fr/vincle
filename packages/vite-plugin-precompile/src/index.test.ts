import { describe, it, expect } from "bun:test";

import precompile, { type PluginConfig } from "./index.js";

function errorCtx(): { error: (msg: string) => never } {
  return {
    error(msg: string): never {
      throw new Error(msg);
    },
  };
}

describe("vite-plugin-precompile", () => {
  function callTransform(
    code: string,
    id: string,
    config?: PluginConfig,
    jsxImportSource?: string,
  ) {
    const plugin = precompile(config);
    const resolvedConfig = { esbuild: { jsxImportSource } };
    // @ts-expect-error — accessing internal Vite plugin lifecycle hooks that aren't on the public type
    plugin.configResolved?.(resolvedConfig);
    // @ts-expect-error — accessing internal Vite plugin transform hook
    return plugin.transform!(code, id);
  }

  it("returns a Vite plugin object", () => {
    const plugin = precompile();
    expect(plugin.name).toBe("@vincle/vite-plugin-precompile");
    expect(plugin.enforce).toBe("pre");
    expect(typeof plugin.transform).toBe("function");
  });

  it("skips non-JSX files", () => {
    const result = callTransform('console.log("hello");', "/src/test.ts");
    expect(result).toBeUndefined();
  });

  it("skips node_modules", () => {
    const result = callTransform("<div>hello</div>", "/node_modules/foo/test.tsx");
    expect(result).toBeUndefined();
  });

  it("skips files without JSX", () => {
    const result = callTransform('const x = "no JSX here";', "/src/app.tsx");
    expect(result).toBeUndefined();
  });

  it("transforms JSX with default virtual runtime module", () => {
    const code = `const x = <div class="foo">{name}</div>;`;
    const result = callTransform(code, "/src/app.tsx");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("virtual:vincle-precompile-runtime");
    expect(result!.code).toContain("jsxTemplate");
    expect(result!.code).toContain("name");
  });

  it("uses explicit runtimeSource when provided", () => {
    const code = `const x = <div>hello</div>;`;
    const result = callTransform(code, "/src/app.tsx", {
      runtimeSource: "custom/jsx-runtime",
    });
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("custom/jsx-runtime");
  });

  it("falls back to the virtual runtime module when no runtimeSource given", () => {
    const code = `const x = <div>hello</div>;`;
    const result = callTransform(code, "/src/app.tsx", undefined, "preact");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("virtual:vincle-precompile-runtime");
  });

  it("prefers explicit runtimeSource over the default", () => {
    const code = `const x = <div>hello</div>;`;
    const result = callTransform(
      code,
      "/src/app.tsx",
      { runtimeSource: "custom/jsx-runtime" },
      "preact",
    );
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("custom/jsx-runtime");
    expect(result!.code).not.toContain("preact/jsx-runtime");
  });

  it("transforms JSX in .jsx files", () => {
    const code = `const x = <div>hello</div>;`;
    const result = callTransform(code, "/src/app.jsx");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("jsxTemplate");
  });

  it("uses the virtual runtime module even when esbuild.jsxImportSource is set", () => {
    const code = `<div/>`;
    const result = callTransform(code, "/src/a.tsx", undefined, "preact");
    expect(result!.code).toContain("virtual:vincle-precompile-runtime");
  });

  it("passes through sourcemap from transform", () => {
    const result = callTransform("<div>{name}</div>", "/src/app.tsx");
    expect(result).not.toBeUndefined();
    expect(result!.map).toBeDefined();
    expect(result!.map!.sources).toContain("/src/app.tsx");
  });

  it("falls back to Deno's output when the runtime cannot be loaded", async () => {
    const plugin = precompile({
      runtimeSource: "totally-bogus-module-xyz",
    });
    // @ts-expect-error — calling internal hook with minimal config for testing
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
    // @ts-expect-error — calling internal hook with a fake plugin context
    await plugin.buildStart.call(ctx);
    // Nothing to read means nothing to improve on, and the generated code
    // imports the helpers itself — so this is a warning, not a broken build.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not load");
    expect(warnings[0]).toContain("Deno's precompile transform");
  });

  /**
   * What the build does with a runtime it could read is decided by the dialect
   * that runtime declares — not by an option, and not by an inventory of its
   * exports. A foreign runtime is the normal case, not a failure; a runtime
   * claiming the `"vincle"` dialect without the helpers to back it is the
   * failure, because nothing else could produce the output it promises.
   */
  describe("what the declared dialect decides", () => {
    // A data: URL is the module — no fixture file to write or clean up.
    const moduleOf = (source: string): string =>
      `data:text/javascript,${encodeURIComponent(source)}`;

    const buildWith = async (source: string): Promise<{ error?: string; warnings: string[] }> => {
      const plugin = precompile({ runtimeSource: moduleOf(source) });
      // @ts-expect-error — calling internal hook with minimal config for testing
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
        // @ts-expect-error — calling internal hook with a fake plugin context
        await plugin.buildStart.call(ctx);
        return { warnings };
      } catch (err) {
        return { error: (err as Error).message, warnings };
      }
    };

    it("takes a foreign runtime as it is, silently", async () => {
      // No dialect declared: Deno's output, which is what its helpers expect.
      // Not a warning either — this is the documented majority case.
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
    // @ts-expect-error — internal virtual module resolved ID
    const RID = "\0virtual:vincle-precompile-runtime";

    it("uses preact/jsx-runtime when jsxImportSource is preact (compatible)", async () => {
      const plugin = precompile();
      // @ts-expect-error — internal hook
      plugin.configResolved({ esbuild: { jsxImportSource: "preact" } });
      // @ts-expect-error — internal hook
      await plugin.buildStart.call(errorCtx());
      // @ts-expect-error — internal hook
      const vm = plugin.load(RID);
      expect(vm).toContain("preact/jsx-runtime");
    });

    it("throws when jsxImportSource module has no jsxTemplate export", async () => {
      const plugin = precompile();
      // node:path/jsx-runtime doesn't exist → import fails → error
      // @ts-expect-error — internal hook
      plugin.configResolved({ esbuild: { jsxImportSource: "node:path" } });
      // @ts-expect-error — internal hook
      await expect(plugin.buildStart.call(errorCtx())).rejects.toThrow(/failed to probe/);
    });

    it("defaults to @vincle/core/jsx-runtime when no jsxImportSource is set", async () => {
      const plugin = precompile();
      // @ts-expect-error — internal hook
      plugin.configResolved({ esbuild: {} });
      // @ts-expect-error — internal hook
      await plugin.buildStart.call(errorCtx());
      // @ts-expect-error — internal hook
      const vm = plugin.load(RID);
      expect(vm).toContain("@vincle/core/jsx-runtime");
    });

    // The two halves of the default path are written in different files: the
    // transform decides which helpers the output imports, the virtual module
    // decides which ones it re-exports. Nothing compared them, and a helper
    // added on one side only is a build that fails with "not exported by" — for
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
        const plugin = precompile({ compatibility });
        // @ts-expect-error — internal hook
        plugin.configResolved({ esbuild: {} });
        // @ts-expect-error — internal hook
        await plugin.buildStart.call(errorCtx());
        // @ts-expect-error — internal hook
        const reExported = named(plugin.load(RID) as string, /export \{([^}]*)\}/);
        expect(reExported).not.toEqual([]);

        for (const code of shapes) {
          // @ts-expect-error — internal hook
          const out = (await plugin.transform.call({}, code, "/src/app.tsx")) as {
            code: string;
          } | null;
          if (!out) continue;
          const imported = named(out.code, /import \{([^}]*)\} from/);
          expect(imported).not.toEqual([]);
          expect(
            imported.filter((h) => !reExported.includes(h)),
            `${code} (compatibility: ${compatibility})`,
          ).toEqual([]);
        }
      }
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
  it("rejects a non-string runtimeSource at plugin creation", () => {
    expect(() => precompile({ runtimeSource: 42 as never })).toThrow(
      "[vincle/vite-plugin-precompile] config: runtimeSource must be a non-empty string module",
    );
  });

  it("rejects an empty runtimeSource at plugin creation", () => {
    expect(() => precompile({ runtimeSource: "" })).toThrow(
      "[vincle/vite-plugin-precompile] config: runtimeSource must be a non-empty string module",
    );
  });

  it("accepts a valid config", () => {
    const plugin = precompile({
      runtimeSource: "@vincle/core/jsx-precompile-runtime",
    });
    expect(plugin.name).toBe("@vincle/vite-plugin-precompile");
  });
});
