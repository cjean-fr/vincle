import { describe, it, expect } from "bun:test";
import { renderToString } from "./index.js";
import { jsx } from "./jsx-runtime.js";

// The JSX transform has no semantic spec — every toolchain reimplemented it,
// aligning on Babel by testing. vincle's escaping/validation only makes sense
// if certain behaviors actually hold across those toolchains. These tests pin
// the ones the runtime *relies on*: if a future compiler changes them, the
// threat model documented in guide/security.mdx breaks here first, loudly.
//
// Bun.Transpiler stands in for the compiler; assertions are on the emitted
// call shape, kept loose enough to survive cosmetic codegen changes.

const tsx = new Bun.Transpiler({
  loader: "tsx",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tsconfig: {
    compilerOptions: { jsx: "react-jsx", jsxImportSource: "rt" },
  } as any,
});

describe("JSX compiler contract — invariants the runtime depends on", () => {
  it("DECODES HTML entities in text → static text can carry a raw <script>", () => {
    // The single reason escaping static text is not redundant.
    const out = tsx.transformSync(
      `export const a = <div>a &amp; b &lt;script&gt;</div>;`,
    );
    expect(out).toContain('"a & b <script>"');
    expect(out).not.toContain("&amp;");
  });

  it("the decoded string, fed back through the runtime, is re-escaped", async () => {
    // Close the loop: whatever the compiler decodes, the runtime neutralizes.
    const html = await renderToString(jsx("div", { children: "a & b <script>" }));
    expect(html).toBe("<div>a &amp; b &lt;script&gt;</div>");
  });

  it("LIFTS `key` out of props (separate argument, never a prop)", () => {
    const out = tsx.transformSync(
      `export const b = <div class="c" key="k">t</div>;`,
    );
    // key must not be a property of the props object…
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
    const html = await renderToString(
      jsx("div", { 'x"><script>': "y", id: "ok" }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain('id="ok"');
  });
});
