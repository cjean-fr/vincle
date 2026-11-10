import { describe, expect, test } from "bun:test";

import { Fragment, jsx, jsxTemplate, jsxTemplateDeferred } from "./jsx-runtime.js";
import { renderToString } from "./render.js";

// What the HTML parser does with `<style>` / `<script>` text depends on the
// element's namespace: rawtext in HTML, ordinary markup in `<svg>` / `<math>`.
// In the latter, a `<` opens a tag, and `<img>` there leaves the `<svg>` for
// HTML. The renderer must escape that text as text.
// @see https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inforeign

const PAYLOAD = "a{}<img src=x onerror=alert(1)>";
const ESCAPED = "a{}&lt;img src=x onerror=alert(1)&gt;";

const style = (children: unknown, props: Record<string, unknown> = {}) =>
  jsx("style", { ...props, children });
const script = (children: unknown) => jsx("script", { children });
const svg = (children: unknown) => jsx("svg", { children });
const math = (children: unknown) => jsx("math", { children });

describe("style and script under <svg> and <math>", () => {
  test("text is escaped as text, not as rawtext", async () => {
    expect(await renderToString(svg(style(PAYLOAD)))).toBe(`<svg><style>${ESCAPED}</style></svg>`);
    expect(await renderToString(svg(script("if (a<b) {}")))).toBe(
      "<svg><script>if (a&lt;b) {}</script></svg>",
    );
    expect(await renderToString(math(style(PAYLOAD)))).toBe(
      `<math><style>${ESCAPED}</style></math>`,
    );
  });

  test("a closing tag in the text cannot leave the element", async () => {
    const out = await renderToString(svg(style("a</style><img src=x onerror=alert(1)>")));
    expect(out).toBe("<svg><style>a&lt;/style&gt;&lt;img src=x onerror=alert(1)&gt;</style></svg>");
  });

  test("a character reference is escaped too: the parser would decode it", async () => {
    expect(await renderToString(svg(style("a &amp; b")))).toBe(
      "<svg><style>a &amp;amp; b</style></svg>",
    );
  });

  test("HTML rawtext is unchanged outside foreign content", async () => {
    expect(await renderToString(style(PAYLOAD))).toBe(`<style>${PAYLOAD}</style>`);
    expect(await renderToString(jsx("div", { children: script("if (a<b) {}") }))).toBe(
      "<div><script>if (a<b) {}</script></div>",
    );
    expect(await renderToString(style("a</style><b>"))).toBe("<style>a<\\/style><b></style>");
  });

  test("reaches nested elements, components, promises, arrays and fragments", async () => {
    const Comp = () => style(PAYLOAD);
    const Async = async () => [jsx("g", { children: style(PAYLOAD) })];
    const cases: unknown[] = [
      jsx("g", { children: jsx("g", { children: style(PAYLOAD) }) }),
      jsx(Comp, {}),
      jsx(Async, {}),
      Promise.resolve(style(PAYLOAD)),
      [[style(PAYLOAD)]],
      jsx(Fragment, { children: style(PAYLOAD) }),
      new Set([style(PAYLOAD)]),
      (async function* () {
        yield style(PAYLOAD);
      })(),
    ];
    for (const child of cases) {
      const out = await renderToString(svg(child));
      expect(out).toContain(`<style>${ESCAPED}</style>`);
      expect(out).not.toContain("<img");
    }
  });

  test("keeps the element's attributes, including a promised one", async () => {
    const out = await renderToString(
      svg(style(PAYLOAD, { media: Promise.resolve("screen"), id: "s" })),
    );
    expect(out).toBe(`<svg><style media="screen" id="s">${ESCAPED}</style></svg>`);
  });

  test("a component error still names the component", async () => {
    function Broken(): never {
      throw new Error("boom");
    }
    await expect(renderToString(svg(jsx(Broken, {})))).rejects.toThrow("[Broken] boom");
  });

  test("HTML integration points go back to rawtext", async () => {
    for (const tag of ["foreignObject", "desc", "title"]) {
      expect(await renderToString(svg(jsx(tag, { children: style(PAYLOAD) })))).toBe(
        `<svg><${tag}><style>${PAYLOAD}</style></${tag}></svg>`,
      );
    }
    for (const tag of ["mi", "mo", "mn", "ms", "mtext"]) {
      expect(await renderToString(math(jsx(tag, { children: style(PAYLOAD) })))).toBe(
        `<math><${tag}><style>${PAYLOAD}</style></${tag}></math>`,
      );
    }
    const html = jsx("annotation-xml", { encoding: "text/html", children: style(PAYLOAD) });
    expect(await renderToString(math(html))).toContain(`<style>${PAYLOAD}</style>`);
    const xml = jsx("annotation-xml", { encoding: "MathML-Content", children: style(PAYLOAD) });
    expect(await renderToString(math(xml))).toContain(`<style>${ESCAPED}</style>`);
  });

  test("a nested root inside an integration point switches back to foreign", async () => {
    const inner = jsx("foreignObject", { children: svg(style(PAYLOAD)) });
    expect(await renderToString(svg(inner))).toContain(`<style>${ESCAPED}</style>`);
    const html = jsx("foreignObject", { children: [style(PAYLOAD), svg(style(PAYLOAD))] });
    expect(await renderToString(svg(html))).toBe(
      `<svg><foreignObject><style>${PAYLOAD}</style><svg><style>${ESCAPED}</style></svg></foreignObject></svg>`,
    );
  });

  test("text inside a style that is not under a root is not touched by a sibling's root", async () => {
    const out = await renderToString([svg(style(PAYLOAD)), style(PAYLOAD)]);
    expect(out).toBe(`<svg><style>${ESCAPED}</style></svg><style>${PAYLOAD}</style>`);
  });
});

describe("templates", () => {
  test("a template returned by a component under an <svg>", async () => {
    const Logo = () => jsxTemplateDeferred`<g>${style(PAYLOAD)}</g>`;
    expect(await renderToString(svg(jsx(Logo, {})))).toBe(
      `<svg><g><style>${ESCAPED}</style></g></svg>`,
    );
    const Wrap = () => jsxTemplateDeferred`<g>${[style(PAYLOAD)]}</g>`;
    expect(await renderToString(svg(jsx(Wrap, {})))).toContain(`<style>${ESCAPED}</style>`);
  });

  test("the same template under HTML stays rawtext", async () => {
    const Logo = () => jsxTemplateDeferred`<div>${style(PAYLOAD)}</div>`;
    expect(await renderToString(jsx(Logo, {}))).toBe(`<div><style>${PAYLOAD}</style></div>`);
  });

  test("the root is in the template text itself (Deno native precompile, compat build)", async () => {
    const dynamic = jsx("style", { children: Promise.resolve(PAYLOAD) });
    for (const el of [style(PAYLOAD), dynamic]) {
      expect(await renderToString(jsxTemplate`<svg><g>${el}</g></svg>`)).toBe(
        `<svg><g><style>${ESCAPED}</style></g></svg>`,
      );
      expect(await renderToString(jsxTemplateDeferred`<math>${[el]}</math>`)).toBe(
        `<math><style>${ESCAPED}</style></math>`,
      );
    }
  });

  test("a template text holding HTML integration points", async () => {
    for (const t of [
      jsxTemplate`<svg><foreignObject>${style(PAYLOAD)}</foreignObject></svg>`,
      jsxTemplate`<svg></svg><div>${style(PAYLOAD)}</div>`,
      jsxTemplate`<div>${style(PAYLOAD)}</div>`,
      jsxTemplate`<math><mtext>${style(PAYLOAD)}</mtext></math>`,
      jsxTemplate`<math><annotation-xml encoding="text/html">${style(PAYLOAD)}</annotation-xml></math>`,
      jsxTemplate`<svg/><div>${style(PAYLOAD)}</div>`,
    ]) {
      expect(await renderToString(t)).toContain(`<style>${PAYLOAD}</style>`);
    }
    expect(
      await renderToString(
        jsxTemplate`<svg><foreignObject><p>x</p></foreignObject><g>${style(PAYLOAD)}</g></svg>`,
      ),
    ).toContain(`<style>${ESCAPED}</style>`);
  });
});

// Template text the HTML parser reads differently from a tag-name scan: a tag
// inside a comment or a quoted attribute is not a tag, and element names are
// case-insensitive. Each hole below sits under `<svg>` for the parser.
// A fix that infers the root from template text must still pass these.
describe("template text a naive scan misreads", () => {
  test("a closing tag inside a comment does not close the root", async () => {
    expect(
      await renderToString(jsxTemplate`<svg><!-- </svg> --><g>${style(PAYLOAD)}</g></svg>`),
    ).toContain(`<style>${ESCAPED}</style>`);
  });

  test("a closing tag inside a quoted attribute does not close the root", async () => {
    expect(
      await renderToString(jsxTemplate`<svg><g title="</svg>">${style(PAYLOAD)}</g></svg>`),
    ).toContain(`<style>${ESCAPED}</style>`);
  });

  test("an opening tag inside a comment does not open a root", async () => {
    expect(await renderToString(jsxTemplate`<!-- <svg> --><div>${style(PAYLOAD)}</div>`)).toContain(
      `<style>${PAYLOAD}</style>`,
    );
  });

  test("element names are case-insensitive", async () => {
    expect(await renderToString(jsxTemplate`<SVG><g>${style(PAYLOAD)}</g></SVG>`)).toContain(
      `<style>${ESCAPED}</style>`,
    );
  });
});

// Known limitation of any rule that follows the JSX tree alone: the parser
// leaves foreign content on these tags, so the style below them is HTML rawtext
// (checked with parse5). Pinned as the spec behavior; it is not required to pass
// for the injection to be closed (escaping more is not an injection).
describe("breakout tags (spec behavior)", () => {
  test.todo("<svg><div><style> is HTML rawtext for the parser");
});
