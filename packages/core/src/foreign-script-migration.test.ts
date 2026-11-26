import { describe, expect, test } from "bun:test";

import { jsx, jsxTemplate, jsxTemplateDeferred } from "./jsx-runtime.js";
import { createContext } from "./provider.js";
import { renderToString } from "./render.js";
import { raw } from "./types.js";

// The text of a <script> or <style> is raw text only in the HTML namespace.
// Under <svg> and <math> the parser reads it as markup: a `<` opens a tag and
// `&` starts a character reference. The renderer follows the parser: it knows
// which namespace an element sits in, however the element arrives (a direct
// child, through a component, a promise, an iterable, a Provider or a template
// hole), and escapes that text as ordinary text where the parser reads markup.
// raw() is never rewritten.

const script = (children: unknown, props: Record<string, unknown> = {}) =>
  jsx("script", { ...props, children });
const style = (children: unknown) => jsx("style", { children });
const svg = (children: unknown) => jsx("svg", { children });
const math = (children: unknown) => jsx("math", { children });
const el = (tag: string, children: unknown, props: Record<string, unknown> = {}) =>
  jsx(tag, { ...props, children });

const PAYLOAD = "a</script><img src=x onerror=alert(1)>";

describe("foreign content: script and style text is escaped as text", () => {
  test("a script under <svg>", async () => {
    expect(await renderToString(svg(script("if (a<b && c) {}")))).toBe(
      "<svg><script>if (a&lt;b &amp;&amp; c) {}</script></svg>",
    );
  });

  test("a script under <math>", async () => {
    expect(await renderToString(math(script("if (a<b) {}")))).toBe(
      "<math><script>if (a&lt;b) {}</script></math>",
    );
  });

  test("markup and a closing tag in the text cannot leave the element", async () => {
    const out = await renderToString(svg(script(PAYLOAD)));
    expect(out).toBe(
      "<svg><script>a&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;</script></svg>",
    );
    expect(out).not.toContain("<img");
  });

  test("a style under <svg> and <math>", async () => {
    const css = "a{}<img src=x onerror=alert(1)>&amp;";
    const escaped = "a{}&lt;img src=x onerror=alert(1)&gt;&amp;amp;";
    expect(await renderToString(svg(style(css)))).toBe(`<svg><style>${escaped}</style></svg>`);
    expect(await renderToString(math(style(css)))).toBe(`<math><style>${escaped}</style></math>`);
  });

  test("a deeper script, and a number or a nullish child", async () => {
    expect(await renderToString(svg(el("g", [script("a<b"), script(1), script(null)])))).toBe(
      "<svg><g><script>a&lt;b</script><script>1</script><script></script></g></svg>",
    );
  });

  test("raw() is trusted and is not escaped again", async () => {
    expect(await renderToString(svg(script(raw("a<b>c"))))).toBe(
      "<svg><script>a<b>c</script></svg>",
    );
    expect(await renderToString(svg(script([raw("a<b"), " & c<d"])))).toBe(
      "<svg><script>a<b &amp; c&lt;d</script></svg>",
    );
  });
});

describe("foreign content: the namespace travels with the walk", () => {
  test("through a component", async () => {
    const Code = () => script("a<b");
    expect(await renderToString(svg(jsx(Code, {})))).toBe("<svg><script>a&lt;b</script></svg>");
  });

  test("through async components, promises and nested components", async () => {
    const Inner = async () => script("a<b");
    const Outer = () => jsx(Inner, {});
    expect(await renderToString(svg(jsx(Outer, {})))).toBe("<svg><script>a&lt;b</script></svg>");
    expect(await renderToString(svg(Promise.resolve(script("a<b"))))).toBe(
      "<svg><script>a&lt;b</script></svg>",
    );
    expect(
      await renderToString(svg([Promise.resolve(el("g", script("a<b"))), script("c<d")])),
    ).toBe("<svg><g><script>a&lt;b</script></g><script>c&lt;d</script></svg>");
  });

  test("through an array, an iterable and an async iterable", async () => {
    async function* chunks() {
      yield script("a<b");
    }
    expect(await renderToString(svg([script("a<b")]))).toBe("<svg><script>a&lt;b</script></svg>");
    expect(await renderToString(svg(new Set([script("a<b")])))).toBe(
      "<svg><script>a&lt;b</script></svg>",
    );
    expect(await renderToString(svg(chunks()))).toBe("<svg><script>a&lt;b</script></svg>");
  });

  test("through a Provider", async () => {
    const Ctx = createContext(0);
    expect(await renderToString(svg(jsx(Ctx, { value: 1, children: script("a<b") })))).toBe(
      "<svg><script>a&lt;b</script></svg>",
    );
  });

  test("a component's script is HTML again outside the <svg>", async () => {
    const Code = () => script("a<b");
    expect(await renderToString([svg(jsx(Code, {})), jsx(Code, {})])).toBe(
      "<svg><script>a&lt;b</script></svg><script>a<b</script>",
    );
  });

  test("the namespace is the one of the nearest <svg> or <math>", async () => {
    expect(await renderToString(svg(math(script("a<b"))))).toBe(
      "<svg><math><script>a&lt;b</script></math></svg>",
    );
  });
});

describe("HTML rawtext rule where the parser reads HTML", () => {
  test("a script and a style outside foreign content keep the rawtext rule", async () => {
    expect(await renderToString(script("if (a<b) {}"))).toBe("<script>if (a<b) {}</script>");
    expect(await renderToString(el("div", style("a<b{}")))).toBe("<div><style>a<b{}</style></div>");
    expect(await renderToString([svg(style("a<b")), style("a<b")])).toBe(
      "<svg><style>a&lt;b</style></svg><style>a<b</style>",
    );
  });

  test("the closing tag is still contained", async () => {
    expect(await renderToString(script("a</script><img>"))).toBe(
      "<script>a\\u003c/script><img></script>",
    );
    expect(await renderToString(style("a</style><b{}"))).toBe("<style>a<\\/style><b{}</style>");
  });

  test("the HTML integration points of <svg> read HTML", async () => {
    for (const tag of ["foreignObject", "desc", "title"]) {
      expect(await renderToString(svg(el(tag, [script("a<b"), style("c<d")])))).toBe(
        `<svg><${tag}><script>a<b</script><style>c<d</style></${tag}></svg>`,
      );
    }
  });

  test("tag names are compared as the tokenizer does, lowercased", async () => {
    expect(await renderToString(el("SVG", script("a<b")))).toBe(
      "<SVG><script>a&lt;b</script></SVG>",
    );
    expect(await renderToString(svg(el("FOREIGNOBJECT", script("a<b"))))).toBe(
      "<svg><FOREIGNOBJECT><script>a<b</script></FOREIGNOBJECT></svg>",
    );
  });

  test("the MathML text integration points read HTML", async () => {
    for (const tag of ["mi", "mo", "mn", "ms", "mtext"]) {
      expect(await renderToString(math(el(tag, script("a<b"))))).toBe(
        `<math><${tag}><script>a<b</script></${tag}></math>`,
      );
    }
  });

  test("those names are ordinary elements under <svg>, and the SVG ones under <math>", async () => {
    expect(await renderToString(svg(el("mtext", script("a<b"))))).toBe(
      "<svg><mtext><script>a&lt;b</script></mtext></svg>",
    );
    expect(await renderToString(math(el("title", script("a<b"))))).toBe(
      "<math><title><script>a&lt;b</script></title></math>",
    );
    expect(await renderToString(math(el("foreignObject", script("a<b"))))).toBe(
      "<math><foreignObject><script>a&lt;b</script></foreignObject></math>",
    );
  });

  test("annotation-xml reads HTML only for an HTML encoding", async () => {
    const wrap = (encoding?: unknown) =>
      renderToString(math(el("annotation-xml", script("a<b"), { encoding })));
    expect(await wrap("text/html")).toBe(
      '<math><annotation-xml encoding="text/html"><script>a<b</script></annotation-xml></math>',
    );
    expect(await wrap("Application/XHTML+xml")).toBe(
      '<math><annotation-xml encoding="Application/XHTML+xml"><script>a<b</script></annotation-xml></math>',
    );
    expect(await wrap("application/x-tex")).toBe(
      '<math><annotation-xml encoding="application/x-tex"><script>a&lt;b</script></annotation-xml></math>',
    );
    expect(await wrap()).toBe(
      "<math><annotation-xml><script>a&lt;b</script></annotation-xml></math>",
    );
  });

  test("a nested <svg> inside an integration point is foreign again", async () => {
    const out = await renderToString(svg(el("foreignObject", [style("a<b"), svg(style("a<b"))])));
    expect(out).toBe(
      "<svg><foreignObject><style>a<b</style><svg><style>a&lt;b</style></svg></foreignObject></svg>",
    );
  });

  test("an element written as raw text is the author's bytes", async () => {
    expect(await renderToString(svg(raw("<svg><script>a<b</script></svg>")))).toBe(
      "<svg><svg><script>a<b</script></svg></svg>",
    );
  });
});

describe("template holes", () => {
  test("a script hole under an <svg> written in the template text", async () => {
    expect(await renderToString(jsxTemplate`<svg><g>${script("a<b")}</g></svg>`)).toBe(
      "<svg><g><script>a&lt;b</script></g></svg>",
    );
    expect(await renderToString(jsxTemplate`<math>${style("a<b")}</math>`)).toBe(
      "<math><style>a&lt;b</style></math>",
    );
  });

  test("the same answer for a strings array built on each call and one kept", async () => {
    const kept = ["<div>", "</div>"];
    const keptSvg = ["<SVG><g>", "</g></SVG>"];
    for (let i = 0; i < 4; i++) {
      expect(await renderToString(jsxTemplateDeferred(["<div>", "</div>"], script("a<b")))).toBe(
        "<div><script>a<b</script></div>",
      );
      expect(await renderToString(jsxTemplateDeferred(kept, script("a<b")))).toBe(
        "<div><script>a<b</script></div>",
      );
      expect(
        await renderToString(jsxTemplateDeferred(["<SVG><g>", "</g></SVG>"], script("a<b"))),
      ).toBe("<SVG><g><script>a&lt;b</script></g></SVG>");
      expect(await renderToString(jsxTemplateDeferred(keptSvg, script("a<b")))).toBe(
        "<SVG><g><script>a&lt;b</script></g></SVG>",
      );
    }
  });

  test("a hole in an HTML template stays HTML", async () => {
    expect(await renderToString(jsxTemplate`<div><p>${script("a<b")}</p></div>`)).toBe(
      "<div><p><script>a<b</script></p></div>",
    );
  });

  test("a start tag split by an attribute hole is followed", async () => {
    expect(
      await renderToString(
        jsxTemplate`<svg viewBox="0 0 1 1" data-x="${"a>b"}">${script("a<b")}</svg>`,
      ),
    ).toBe('<svg viewBox="0 0 1 1" data-x="a&gt;b"><script>a&lt;b</script></svg>');
  });

  test("closed elements, integration points and a sibling after the </svg>", async () => {
    expect(
      await renderToString(
        jsxTemplate`<svg><g></g><foreignObject>${script("a<b")}</foreignObject>${script("c<d")}</svg>${script("e<f")}`,
      ),
    ).toBe(
      "<svg><g></g><foreignObject><script>a<b</script></foreignObject><script>c&lt;d</script></svg><script>e<f</script>",
    );
  });

  test("a rawtext body in the template text does not open elements", async () => {
    expect(
      await renderToString(
        jsxTemplate`<div><script>if (a<b) {}</script></div><svg>${script("c<d")}</svg>`,
      ),
    ).toBe("<div><script>if (a<b) {}</script></div><svg><script>c&lt;d</script></svg>");
  });

  test("an array hole, a component hole and a deferred template", async () => {
    const Code = () => script("a<b");
    expect(await renderToString(jsxTemplate`<svg>${[script("a<b"), script("c<d")]}</svg>`)).toBe(
      "<svg><script>a&lt;b</script><script>c&lt;d</script></svg>",
    );
    expect(await renderToString(jsxTemplate`<svg>${jsx(Code, {})}</svg>`)).toBe(
      "<svg><script>a&lt;b</script></svg>",
    );
    expect(await renderToString(jsxTemplateDeferred`<svg>${[script("a<b")]}</svg>`)).toBe(
      "<svg><script>a&lt;b</script></svg>",
    );
  });

  test("a template placed under an <svg> carries the namespace into its holes", async () => {
    const Code = () => jsxTemplate`<g>${script("a<b")}</g>`;
    expect(await renderToString(svg(jsx(Code, {})))).toBe(
      "<svg><g><script>a&lt;b</script></g></svg>",
    );
    expect(await renderToString(jsx("div", { children: jsx(Code, {}) }))).toBe(
      "<div><g><script>a<b</script></g></div>",
    );
  });

  test("a hole inside a nested element of a template under an <svg>", async () => {
    const Code = () => jsxTemplate`<g><g>${script("a<b")}</g></g>`;
    expect(await renderToString(svg(el("foreignObject", jsx(Code, {}))))).toBe(
      "<svg><foreignObject><g><g><script>a<b</script></g></g></foreignObject></svg>",
    );
  });
});
