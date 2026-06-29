import precompile, { type PluginConfig } from "./index.js";
import { describe, it, expect } from "bun:test";

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
    const result = callTransform(
      "<div>hello</div>",
      "/node_modules/foo/test.tsx",
    );
    expect(result).toBeUndefined();
  });

  it("skips files without JSX", () => {
    const result = callTransform('const x = "no JSX here";', "/src/app.tsx");
    expect(result).toBeUndefined();
  });

  it("transforms JSX with default runtimeSource", () => {
    const code = `const x = <div class="foo">{name}</div>;`;
    const result = callTransform(code, "/src/app.tsx");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("@vincle/core/jsx-runtime");
    expect(result!.code).toContain("jsxTemplate");
    expect(result!.code).toContain("jsxEscape(name)");
  });

  it("uses explicit runtimeSource when provided", () => {
    const code = `const x = <div>hello</div>;`;
    const result = callTransform(code, "/src/app.tsx", {
      runtimeSource: "custom/jsx-runtime",
    });
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("custom/jsx-runtime");
  });

  it("falls back to @vincle/core/jsx-runtime when no runtimeSource given", () => {
    const code = `const x = <div>hello</div>;`;
    const result = callTransform(code, "/src/app.tsx", undefined, "preact");
    expect(result).not.toBeUndefined();
    expect(result!.code).toContain("@vincle/core/jsx-runtime");
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

  it("merges esbuild.jsxImportSource when set but no runtimeSource", () => {
    const code = `<div/>`;
    const result = callTransform(code, "/src/a.tsx", undefined, "preact");
    expect(result!.code).toContain("@vincle/core/jsx-runtime");
  });

  it("passes through sourcemap from transform", () => {
    const result = callTransform("<div>{name}</div>", "/src/app.tsx");
    expect(result).not.toBeUndefined();
    expect(result!.map).toBeDefined();
    expect(result!.map!.sources).toContain("/src/app.tsx");
  });

  it("secure mode errors the build when the runtime cannot be loaded", async () => {
    const plugin = precompile({
      secure: true,
      runtimeSource: "totally-bogus-module-xyz",
    });
    // @ts-expect-error — calling internal hook with minimal config for testing
    plugin.configResolved.call({}, { esbuild: {} });
    const ctx = {
      error(msg: string): never {
        throw new Error(msg);
      },
    };
    // @ts-expect-error — calling internal hook with fake context to test secure mode error handling
    await expect(plugin.buildStart.call(ctx)).rejects.toThrow(
      /secure mode/,
    );
  });
});
