import { describe, expect, test } from "bun:test";

// `renderToString` and the JSX runtime must not reach `AsyncLocalStorage`: a
// browser bundle that only renders would otherwise pull `node:async_hooks`.
// Only `createContext`/`Scope` are allowed to.
async function bundle(entry: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [new URL(entry, import.meta.url).pathname],
    target: "browser",
    external: ["node:*"],
    minify: false,
  });
  expect(result.success).toBe(true);
  return (await Promise.all(result.outputs.map((o) => o.text()))).join("\n");
}

describe("module graph", () => {
  test.each(["../src/render.ts", "../src/jsx-runtime.ts", "../src/jsx-precompile-runtime.ts"])(
    "%s does not bundle node:async_hooks",
    async (entry) => {
      expect(await bundle(entry)).not.toContain("async_hooks");
    },
  );

  // Without this the assertions above would pass on a bundler that drops the import.
  test("the provider entry does bundle it", async () => {
    expect(await bundle("../src/provider.ts")).toContain("async_hooks");
  });
});
