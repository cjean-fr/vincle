import { transformAsync } from "@babel/core";
import jsxPlugin from "@babel/plugin-transform-react-jsx";
import jsxDevPlugin from "@babel/plugin-transform-react-jsx-development";
import { describe, it, expect } from "bun:test";
import { build, transform } from "esbuild";
import path from "node:path";
import ts from "typescript";

import { renderToString } from "../index.js";
import { jsx } from "../src/jsx-runtime.js";

// The JSX transform has no semantic spec: every toolchain reimplemented it,
// aligning on Babel by testing. vincle's escaping/validation only makes sense
// if certain behaviors actually hold across those toolchains. These tests pin
// the ones the runtime *relies on*: if a future compiler changes them, the
// threat model documented in guide/security.mdx breaks here first, loudly.
//
// Bun smoke tests inspect call shapes. The external matrix below executes
// real compiler output against the built package, in both runtime modes.

const tsx = new Bun.Transpiler({
  loader: "tsx",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tsconfig: {
    compilerOptions: { jsx: "react-jsx", jsxImportSource: "rt" },
  } as any,
});

describe("JSX compiler contract: invariants the runtime depends on", () => {
  it("DECODES HTML entities in text → static text can carry a raw <script>", () => {
    // The single reason escaping static text is not redundant.
    const out = tsx.transformSync(`export const a = <div>a &amp; b &lt;script&gt;</div>;`);
    expect(out).toContain('"a & b <script>"');
    expect(out).not.toContain("&amp;");
  });

  it("the decoded string, fed back through the runtime, is re-escaped", async () => {
    // Close the loop: whatever the compiler decodes, the runtime neutralizes.
    const html = await renderToString(jsx("div", { children: "a & b <script>" }));
    expect(html).toBe("<div>a &amp; b &lt;script&gt;</div>");
  });

  it("lifts an explicit key without a spread into a separate argument", () => {
    const out = tsx.transformSync(`export const b = <div class="c" key="k">t</div>;`);
    // This explicit key is lifted. A key in spread props stays a component prop.
    expect(out).not.toMatch(/key:\s*["']k["']/);
    // …and its value is present as a trailing argument.
    expect(out).toContain('"k"');
  });

  it("EMITS spread names verbatim → attribute names can be runtime-determined", () => {
    // Proves the runtime cannot trust attribute names to be author-written:
    // `{...p}` names are whatever the object holds. Hence isValidAttrName.
    const out = tsx.transformSync(`export const c = <div {...p} title="t" />;`);
    expect(out).toContain("...p");
  });

  it("runtime enforces name validity that the compiler cannot (spread case)", async () => {
    // A hostile name arriving via spread must not break out of the tag.
    const html = await renderToString(jsx("div", { 'x"><script>': "y", id: "ok" }));
    expect(html).not.toContain("<script>");
    expect(html).toContain('id="ok"');
  });
});

const compilerFixture = `
import { renderToString } from "@vincle/core";
const seen = [];
const props = { title: "spread", children: "wrong", key: "spread" };
function Card(p) {
  seen.push({ key: p.key, childrenCount: Array.isArray(p.children) ? p.children.length : p.children });
  return <b>{p.children}</b>;
}
const node = <>
  <Card {...props} key="after">first<span>second</span></Card>
  <Card key="before" {...props}>third</Card>
  <div {...props} key="native">own</div>
</>;
console.log(JSON.stringify({ html: await renderToString(node), seen }));
`;

// These are build artifacts, not aliases back to the source under test.
// Turbo orders core#test after core#build; direct runs require a core build.
const dist = path.resolve(import.meta.dirname, "../dist");
for (const compiler of ["esbuild", "typescript", "babel"] as const) {
  for (const development of [false, true]) {
    it(`executes ${compiler} automatic JSX (${development ? "development" : "production"}) against built exports`, async () => {
      let code: string;
      if (compiler === "esbuild") {
        code = (
          await transform(compilerFixture, {
            loader: "tsx",
            jsx: "automatic",
            jsxDev: development,
            jsxImportSource: "@vincle/core",
          })
        ).code;
      } else if (compiler === "typescript") {
        code = ts.transpileModule(compilerFixture, {
          compilerOptions: {
            jsx: development ? ts.JsxEmit.ReactJSXDev : ts.JsxEmit.ReactJSX,
            jsxImportSource: "@vincle/core",
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
          },
        }).outputText;
      } else {
        const result = await transformAsync(compilerFixture, {
          configFile: false,
          babelrc: false,
          plugins: [
            [
              development ? jsxDevPlugin : jsxPlugin,
              { runtime: "automatic", importSource: "@vincle/core" },
            ],
          ],
        });
        if (!result?.code) throw new Error("Babel returned no compiled code");
        code = result.code;
      }
      expect(code).toContain("createElement");
      const bundled = await build({
        stdin: {
          contents: code,
          loader: "js",
          resolveDir: path.resolve(import.meta.dirname, ".."),
        },
        bundle: true,
        platform: "node",
        format: "esm",
        write: false,
        logLevel: "silent",
        alias: {
          "@vincle/core": path.join(dist, "index.mjs"),
          "@vincle/core/jsx-runtime": path.join(dist, "jsx-runtime.mjs"),
          "@vincle/core/jsx-dev-runtime": path.join(dist, "jsx-dev-runtime.mjs"),
        },
      });
      const output = bundled.outputFiles[0];
      if (!output) throw new Error("esbuild returned no bundle");
      const run = Bun.spawnSync(["node", "--input-type=module", "-e", output.text]);
      expect(new TextDecoder().decode(run.stderr)).toBe("");
      expect(run.exitCode).toBe(0);
      expect(JSON.parse(new TextDecoder().decode(run.stdout))).toEqual({
        html: '<b>first<span>second</span></b><b>third</b><div title="spread">own</div>',
        seen: [
          { key: "after", childrenCount: 2 },
          { key: "spread", childrenCount: "third" },
        ],
      });
    });
  }
}
