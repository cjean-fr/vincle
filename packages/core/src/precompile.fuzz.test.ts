// Locks the "one coercion core" deepening: `jsxEscape` is now an alias of
// `renderChild`, so the precompile escape path and the dynamic render path are
// the same descent by construction. These property-based tests assert that
// guarantee at the core interface, so a future change can't silently re-fork it.
import { renderToString, raw } from "./index.js";
import { jsx } from "./jsx-runtime.js";
import { jsxEscape, jsxTemplate } from "./precompile.js";
import { renderChild } from "./utils/render-child.js";
import { describe, it, expect } from "bun:test";
import fc from "fast-check";

// Recursive VincleNode arbitrary WITHOUT RawString: every string leaf is untrusted,
// so the whole output must be free of raw angle brackets. Includes nested arrays
// and (already-resolved) Promises to exercise the async descent at any depth.
const { childNoRaw } = fc.letrec<{ childNoRaw: unknown }>((tie) => ({
  childNoRaw: fc.oneof(
    { maxDepth: 3, depthSize: "small" },
    fc.fullUnicodeString(),
    fc.integer(),
    fc.constantFrom(null, undefined, true, false),
    fc.array(tie("childNoRaw"), { maxLength: 4 }),
    tie("childNoRaw").map((n) => Promise.resolve(n)),
  ),
}));

describe("coercion core — renderChild invariants (property-based)", () => {
  it("escapes every untrusted leaf — no raw < or > survives, at any depth", async () => {
    await fc.assert(
      fc.asyncProperty(childNoRaw, async (tree) => {
        const out = await renderChild(tree);
        return !out.includes("<") && !out.includes(">");
      }),
      { numRuns: 1000 },
    );
  });

  it("passes RawString content through verbatim (never escaped)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.fullUnicodeString(), async (s) => {
        return (await renderChild(raw(s))) === s;
      }),
      { numRuns: 1000 },
    );
  });
});

describe("precompile path ≡ dynamic path", () => {
  // The same child, rendered once through the precompile slot machinery and once
  // through renderToString, must produce byte-identical output.
  const viaTemplate = async (child: unknown) =>
    (await jsxTemplate(["<div>", "</div>"], jsxEscape(child))).toString();
  const viaDynamic = (child: unknown) =>
    renderToString(jsx("div", { children: child }));

  it("matches on representative children (escape, RawString, arrays, async)", async () => {
    const cases: unknown[] = [
      "plain text",
      "<script>alert(1)</script>",
      "a & b < c > d",
      "",
      null,
      undefined,
      false,
      true,
      42,
      raw("<b>bold</b>"),
      ["x", "<y>", 7, raw("<z>")],
      ["a", [Promise.resolve("b"), "c"]], // nested Promise must be awaited, not "[object Promise]"
      Promise.resolve("<async>"),
    ];
    for (const c of cases) {
      expect(await viaTemplate(c)).toBe(await viaDynamic(c));
    }
  });

  it("matches on arbitrary trees (property-based)", async () => {
    await fc.assert(
      fc.asyncProperty(childNoRaw, async (child) => {
        return (await viaTemplate(child)) === (await viaDynamic(child));
      }),
      { numRuns: 600 },
    );
  });
});
