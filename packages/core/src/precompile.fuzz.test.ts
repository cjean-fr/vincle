import { describe, it, expect } from "bun:test";
import fc from "fast-check";

// Locks the "one coercion core" deepening: `jsxEscape` is now an alias of
// `renderChild`, so the precompile escape path and the dynamic render path are
// the same descent by construction. These property-based tests assert that
// guarantee at the core interface, so a future change can't silently re-fork it.
import { renderToString, raw } from "./index.js";
import { jsxEscape, jsxTemplate } from "./jsx-precompile-runtime.js";
import { jsx } from "./jsx-runtime.js";
import { renderChild } from "./render.js";

// Recursive VNode arbitrary WITHOUT RawString: every string leaf is untrusted,
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
        return typeof out === "string" && !out.includes("<") && !out.includes(">");
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
  // The same child rendered once through jsxEscape→jsxTemplate and once
  // through renderToString must produce byte-identical output.
  const viaTemplate = async (child: unknown) => {
    const escaped = jsxEscape(child);
    const result =
      escaped instanceof Promise
        ? await jsxTemplate(["<div>", "</div>"], await escaped)
        : jsxTemplate(["<div>", "</div>"], escaped);
    return result instanceof Promise ? (await result).value : result.value;
  };
  const viaDynamic = (child: unknown) => renderToString(jsx("div", { children: child }));

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
    ["a", [Promise.resolve("b"), "c"]],
    Promise.resolve("<async>"),
    // Re-iterable non-array iterables must coerce like the dynamic path,
    // not stringify to "[object Set]" / "[object Map]".
    new Set(["a", "<b>", 3]),
    new Map([
      [1, "x"],
      [2, "<y>"],
    ]),
  ];

  it.concurrent.each(cases)("matches on representative children - case #%#", async (c) => {
    const [templateResult, dynamicResult] = await Promise.all([viaTemplate(c), viaDynamic(c)]);

    expect(templateResult).toBe(dynamicResult);
  });

  it("coerces one-shot iterables (sync & async generators) like the dynamic path", async () => {
    // Fresh instance per path — a generator is consumed once.
    const syncGen = () =>
      (function* () {
        yield "gen-";
        yield "<z>";
        yield 7;
      })();
    expect(await viaTemplate(syncGen())).toBe(await viaDynamic(syncGen()));

    const asyncGen = () =>
      (async function* () {
        yield "async-";
        yield "<w>";
      })();
    expect(await viaTemplate(asyncGen())).toBe(await viaDynamic(asyncGen()));

    // And the concrete expected bytes, so a regression is legible.
    expect(await viaTemplate(syncGen())).toBe("<div>gen-&lt;z&gt;7</div>");
    expect(await viaTemplate(asyncGen())).toBe("<div>async-&lt;w&gt;</div>");
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
