import { describe, expect, test } from "bun:test";

import { escapeContent } from "./escape.js";
import { jsx } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { raw } from "./types.js";

// The documented recipe for a script or style inside `<svg>` / `<math>`,
// spelled out with public API only: escape the source as text, then trust
// the escaped bytes. Foreign content is markup, not rawtext, so the parser
// decodes the entities back to the source. No component is required.

const svg = (children: unknown) => jsx("svg", { children });
const math = (children: unknown) => jsx("math", { children });

describe("the svg script recipe", () => {
  test("escapes the source as text under <svg>", async () => {
    const source = "if (a<b) { go(a & b) }";
    const out = await renderToString(svg(jsx("script", { children: raw(escapeContent(source)) })));
    expect(out).toBe("<svg><script>if (a&lt;b) { go(a &amp; b) }</script></svg>");
  });

  test("escapes the source as text under <math>", async () => {
    const source = "if (a<b) { go(a & b) }";
    const out = await renderToString(math(jsx("script", { children: raw(escapeContent(source)) })));
    expect(out).toBe("<math><script>if (a&lt;b) { go(a &amp; b) }</script></math>");
  });

  test("a closing tag in the source cannot leave the element", async () => {
    const source = 'a</script><img src=x onerror="alert(1)">';
    const out = await renderToString(svg(jsx("script", { children: raw(escapeContent(source)) })));
    expect(out).toBe(
      '<svg><script>a&lt;/script&gt;&lt;img src=x onerror="alert(1)"&gt;</script></svg>',
    );
  });

  test("a character reference in the source round-trips", async () => {
    const out = await renderToString(
      svg(jsx("script", { children: raw(escapeContent("a &amp; b")) })),
    );
    expect(out).toBe("<svg><script>a &amp;amp; b</script></svg>");
  });

  test("a plain <script> under <svg> keeps the HTML rawtext rule", async () => {
    const out = await renderToString(svg(jsx("script", { children: "if (a<b) {}" })));
    expect(out).toBe("<svg><script>if (a<b) {}</script></svg>");
  });
});
