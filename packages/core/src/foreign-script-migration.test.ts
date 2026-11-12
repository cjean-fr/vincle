import { describe, expect, test } from "bun:test";

import { jsx, jsxTemplate } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { raw } from "./types.js";

// Migration reference for the dropped provisional post-process
// (foreign-text.ts). Each case names what main emitted with the
// post-process and pins what the runtime emits now. Changed cases are the
// intended behavior change: a plain <script>/<style> keeps the HTML
// rawtext rule everywhere, and the @vincle/no-foreign-rawtext lint rule
// flags the naive pattern under <svg>/<math> at author time, pointing to
// the raw(escapeContent(source)) recipe. Preserved cases kept their exact
// bytes.

const script = (children: unknown, props: Record<string, unknown> = {}) =>
  jsx("script", { ...props, children });
const style = (children: unknown) => jsx("style", { children });
const svg = (children: unknown) => jsx("svg", { children });
const math = (children: unknown) => jsx("math", { children });

describe("changed: naive script/style in foreign content keeps the rawtext rule", () => {
  test("a naive script under <svg> is no longer escaped", async () => {
    // Was "<svg><script>if (a&lt;b) {}</script></svg>" with the post-process.
    expect(await renderToString(svg(script("if (a<b) {}")))).toBe(
      "<svg><script>if (a<b) {}</script></svg>",
    );
  });

  test("markup in a naive script body is no longer neutralized", async () => {
    // Was "<svg><script>a&lt;img src=x onerror=alert(1)&gt;</script></svg>".
    // This is the regression the lint rule exists to catch at author time.
    expect(await renderToString(svg(script("a<img src=x onerror=alert(1)>")))).toBe(
      "<svg><script>a<img src=x onerror=alert(1)></script></svg>",
    );
  });

  test("the closing-tag containment still holds through the rawtext rule", async () => {
    // Was "a\\u003c/script&gt;&lt;img&gt;": the walk's </script neutralization
    // still applies; only the entity escaping of the rest is gone.
    expect(await renderToString(svg(script("a</script><img>")))).toBe(
      "<svg><script>a\\u003c/script><img></script></svg>",
    );
  });

  test("raw() content is trusted, not rewritten by a post-pass", async () => {
    // Was "<svg><script>a&lt;b&gt;c</script></svg>": the post-process
    // re-escaped raw() content. raw() is the trust boundary; lint flags the
    // naive element instead.
    expect(await renderToString(svg(script(raw("a<b>c"))))).toBe(
      "<svg><script>a<b>c</script></svg>",
    );
  });

  test("a naive style under <svg> is no longer escaped", async () => {
    // Was "a{}&lt;img src=x onerror=alert(1)&gt;&amp;amp;".
    const PAYLOAD = "a{}<img src=x onerror=alert(1)>&amp;";
    expect(await renderToString(svg(style(PAYLOAD)))).toBe(`<svg><style>${PAYLOAD}</style></svg>`);
  });

  test("the style closer containment holds through the rawtext rule", async () => {
    // Was "a&lt;\/style&gt;&lt;b{}": the closer policy is the same as for
    // </script, the mechanism differs - <\/ is a CSS escape where \u003c is
    // a JS one. Only the entity escaping of the rest is gone.
    expect(await renderToString(svg(style("a</style><b{}")))).toBe(
      "<svg><style>a<\\/style><b{}</style></svg>",
    );
  });

  test("a nested <svg> inside an integration point keeps rawtext too", async () => {
    // Was "<svg><foreignObject><style>a<b</style><svg><style>a&lt;b</style></svg></foreignObject></svg>".
    const inner = jsx("foreignObject", { children: [style("a<b"), svg(style("a<b"))] });
    expect(await renderToString(svg(inner))).toBe(
      "<svg><foreignObject><style>a<b</style><svg><style>a<b</style></svg></foreignObject></svg>",
    );
  });
});

describe("preserved: the HTML rawtext rule outside foreign content", () => {
  test("<math> keeps naive script/style raw, as before", async () => {
    // The post-process only ran when an <svg> element was written: <math>
    // content was raw on main already, and stays raw. The lint rule and the
    // recipe are the answer there too.
    expect(await renderToString(math(script("if (a<b) {}")))).toBe(
      "<math><script>if (a<b) {}</script></math>",
    );
    expect(await renderToString(math(style("a<b{}")))).toBe("<math><style>a<b{}</style></math>");
  });

  test("HTML scripts outside svg", async () => {
    expect(await renderToString(script("if (a<b) {}"))).toBe("<script>if (a<b) {}</script>");
    expect(await renderToString(jsx("div", { children: script("a<b") }))).toBe(
      "<div><script>a<b</script></div>",
    );
    expect(await renderToString([jsx("svg", {}), script("a<b")])).toBe(
      "<svg></svg><script>a<b</script>",
    );
  });

  test("an HTML script inside a foreignObject", async () => {
    expect(await renderToString(svg(jsx("foreignObject", { children: script("a<b") })))).toBe(
      "<svg><foreignObject><script>a<b</script></foreignObject></svg>",
    );
  });

  test("styles in the HTML integration points keep their text as HTML", async () => {
    const PAYLOAD = "a{}<img src=x onerror=alert(1)>&amp;";
    for (const tag of ["foreignObject", "desc", "title"]) {
      expect(await renderToString(svg(jsx(tag, { children: style(PAYLOAD) })))).toBe(
        `<svg><${tag}><style>${PAYLOAD}</style></${tag}></svg>`,
      );
    }
  });

  test("a style outside any root is untouched", async () => {
    expect(await renderToString([svg(style("a<b")), style("a<b")])).toBe(
      "<svg><style>a<b</style></svg><style>a<b</style>",
    );
  });

  test("an svg written in a template's text stays the author's bytes", async () => {
    // The post-process already could not see this; the rule is now uniform:
    // template text is trusted author content everywhere.
    expect(await renderToString(jsxTemplate`<svg><g>${script("a<b")}</g></svg>`)).toBe(
      "<svg><g><script>a<b</script></g></svg>",
    );
  });

  test("a root written only as raw text is the author's bytes", async () => {
    expect(await renderToString(svg(raw("<svg><script>a<b</script></svg>")))).toBe(
      "<svg><svg><script>a<b</script></svg></svg>",
    );
  });
});
