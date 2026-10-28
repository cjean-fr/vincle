import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

import precompileTransform from "./index.js";

// Recorded from real Deno 2.9.8 (deno_ast 0.53.3), not from a JSX compiler's
// approximation. The spy intentionally has no createElement export.
// https://github.com/denoland/deno/releases/tag/v2.9.8
// https://crates.io/api/v1/crates/deno_ast/0.53.3/download
for (const fixture of ["", "edge-"]) {
  const source = readFileSync(
    new URL(`./fixtures/deno-2.9.8/${fixture}input.txt`, import.meta.url),
    "utf8",
  );
  const expected: unknown = JSON.parse(
    readFileSync(new URL(`./fixtures/deno-2.9.8/${fixture}expected.json`, import.meta.url), "utf8"),
  );
  it(`matches Deno native ${fixture || "basic"} precompile calls without a foreign createElement adapter`, () => {
    const result = precompileTransform(source, "/oracle.tsx", {
      runtimeSource: "native-oracle/jsx-runtime",
    });
    expect(result).not.toBeNull();
    const compiled = ts.transpileModule(result!.code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "native-oracle",
      },
    }).outputText;
    const runtime = {
      jsx(tag: string | { name: string }, props: unknown, ...rest: unknown[]) {
        return {
          tag: typeof tag === "string" ? tag : tag.name,
          props,
          key: rest.length ? rest[0] : "<absent>",
        };
      },
      jsxTemplate(strings: TemplateStringsArray, ...values: unknown[]) {
        return { template: [...strings], values };
      },
      jsxEscape(value: unknown) {
        return { escape: value };
      },
      jsxAttr(name: string, value: unknown) {
        return { attr: [name, value] };
      },
    };
    let output: unknown;
    const load = (name: string) => {
      if (name !== "native-oracle/jsx-runtime" && name !== "native-oracle")
        throw new Error(`Unexpected runtime import ${name}`);
      return runtime;
    };
    new Function("require", "exports", "console", compiled)(
      load,
      {},
      {
        log(value: string) {
          output = JSON.parse(value);
        },
      },
    );
    expect(output).toEqual(expected);
  });
}
