import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import precompileBun from "./bun.js";

/** The plugin hands its work to one `onLoad` callback; this is that callback. */
async function loaderOf(config?: Parameters<typeof precompileBun>[0]) {
  let loaded: ((args: { path: string }) => Promise<unknown>) | undefined;
  await precompileBun(config).setup({
    onLoad(_constraints, callback) {
      loaded = callback as typeof loaded;
    },
  });
  if (loaded === undefined) throw new Error("the plugin registered no loader");
  return loaded;
}

function fileWith(contents: string, name: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "vincle-precompile-")), name);
  writeFileSync(path, contents);
  return path;
}

describe("the bun adapter", () => {
  it("precompiles a module carrying JSX", async () => {
    const load = await loaderOf({ runtimeSource: "@vincle/core/jsx-runtime" });
    const path = fileWith('export const a = <div class="x">hi</div>;\n', "page.tsx");

    const result = (await load({ path })) as { contents: string; loader: string };

    expect(result.contents).toContain("jsxTemplate");
    expect(result.contents).toContain('<div class="x">hi</div>');
    expect(result.loader).toBe("tsx");
  });

  it("leaves a module with no JSX alone", async () => {
    const load = await loaderOf({ runtimeSource: "@vincle/core/jsx-runtime" });
    const path = fileWith("export const a = 1;\n", "plain.tsx");

    expect(await load({ path })).toBeUndefined();
  });

  it("does not touch a dependency", async () => {
    const load = await loaderOf({ runtimeSource: "@vincle/core/jsx-runtime" });

    expect(await load({ path: "/app/node_modules/dep/page.tsx" })).toBeUndefined();
  });

  it("sets the loader from the extension", async () => {
    const load = await loaderOf({ runtimeSource: "@vincle/core/jsx-runtime" });
    const path = fileWith("export const a = <p>hi</p>;\n", "page.jsx");

    const result = (await load({ path })) as { loader: string };

    expect(result.loader).toBe("jsx");
  });

  it("survives a runtimeSource it cannot import", async () => {
    const load = await loaderOf({ runtimeSource: "@nothing/here" });
    const path = fileWith("export const a = <div>hi</div>;\n", "page.tsx");

    const result = (await load({ path })) as { contents: string };

    expect(result.contents).toContain("jsxTemplate");
  });
});
