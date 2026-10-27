import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveConfig } from "vite";

import bun from "./bun.js";
import transform from "./index.js";
import vite from "./vite.js";

test("all entry points reject an invalid runtimeSource, including non-JSX input", () => {
  for (const runtimeSource of ["", null, 42]) {
    for (const run of [
      () => transform("const x = 1", "a.tsx", { runtimeSource: runtimeSource as never }),
      () => bun({ runtimeSource: runtimeSource as never }),
      () => vite({ runtimeSource: runtimeSource as never }),
    ])
      expect(run).toThrow("runtimeSource must be a non-empty string");
  }
  expect(
    transform("const x = <p>ok</p>", "a.tsx", { runtimeSource: "custom/runtime" })?.code,
  ).toContain('from "custom/runtime"');
});

test("type-only canonical helper imports become value bindings without duplicates", () => {
  const result = transform(
    'import { type jsxAttr } from "@vincle/core/jsx-runtime"; export const x = <a href={href}>hi</a>;',
    "a.tsx",
  )!;
  expect(result.code).toContain("import { jsxAttr, jsxTemplate }");
  expect(result.code).not.toContain("type jsxAttr");
  expect(result.code).toContain('jsxAttr("href", href)');
  const alias = transform(
    'import { type jsxAttr as Attr } from "@vincle/core/jsx-runtime"; export const x = <a href={href}>hi</a>;',
    "a.tsx",
  )!;
  expect(alias.code).toContain("type jsxAttr as Attr");
  expect(alias.code).toContain(", jsxAttr");
});

test("real Vite config detects oxc and esbuild sources and rejects tsconfig-only JSX", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "precompile-config-"));
  try {
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { jsxImportSource: "preact" } }),
    );
    for (const config of [
      { oxc: { jsx: { importSource: "preact" } } },
      { esbuild: { jsxImportSource: "preact" } },
      {},
    ]) {
      const plugin = vite();
      const resolved = await resolveConfig(
        { root, configFile: false, logLevel: "silent", ...config },
        "build",
      );
      // @ts-expect-error: invoking lifecycle hooks directly with a test context
      plugin.configResolved(resolved);
      const warnings: string[] = [];
      const ctx = {
        error: (message: string): never => {
          throw new Error(message);
        },
        warn: (message: string) => warnings.push(message),
      };
      // @ts-expect-error: same
      await plugin.buildStart.call(ctx);
      // @ts-expect-error: same
      plugin.transform.call(ctx, "export const x = <p>ok</p>", "/app/a.tsx");

      // @ts-expect-error: same
      const runtime = plugin.load("\0virtual:vincle-precompile-runtime");
      if ("oxc" in config || "esbuild" in config) {
        expect(runtime).toContain("preact/jsx-runtime");
        // @ts-expect-error: invoking hook with test context
        plugin.buildEnd.call(ctx);
        expect(warnings).toEqual([]);
      } else {
        expect(runtime).toContain("@vincle/core/jsx-runtime");
        // @ts-expect-error: invoking hook with test context
        expect(() => plugin.buildEnd.call(ctx)).toThrow("no JSX runtime source was detected");
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
