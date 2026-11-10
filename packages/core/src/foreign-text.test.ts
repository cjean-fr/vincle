import { describe, expect, test } from "bun:test";

import { escapeForeignText } from "./foreign-text.js";
import { jsx, jsxTemplate, jsxTemplateDeferred } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { raw } from "./types.js";

const script = (children: unknown, props: Record<string, unknown> = {}) =>
  jsx("script", { ...props, children });
const svg = (children: unknown) => jsx("svg", { children });

describe("script under an <svg> element", () => {
  test("every < of the body is escaped, so the text stays text", async () => {
    expect(await renderToString(svg(script("if (a<b) {}")))).toBe(
      "<svg><script>if (a&lt;b) {}</script></svg>",
    );
    expect(await renderToString(svg(script("x=1<2<3")))).toBe(
      "<svg><script>x=1&lt;2&lt;3</script></svg>",
    );
  });

  test("a tag in the body does not leave the svg", async () => {
    const out = await renderToString(svg(script("a<img src=x onerror=alert(1)>")));
    expect(out).toBe("<svg><script>a&lt;img src=x onerror=alert(1)&gt;</script></svg>");
    expect(out).not.toContain("<img");
  });

  test("the closing tag is the only < left", async () => {
    const out = await renderToString(svg(script("a<b")));
    expect(out.match(/</g)?.length).toBe(4); // <svg> <script> </script> </svg>
  });

  test("a closer-like sequence in the text was already neutralized", async () => {
    // The HTML-boundary rule makes it `\u003c/script>`; the rest is escaped here.
    expect(await renderToString(svg(script("a</script><img>")))).toBe(
      "<svg><script>a\\u003c/script&gt;&lt;img&gt;</script></svg>",
    );
  });

  test("attributes, including a quoted > , do not confuse the opening tag", async () => {
    expect(
      await renderToString(svg(script("a<b", { type: "module", "data-x": "1>2", id: "s" }))),
    ).toBe('<svg><script type="module" data-x="1>2" id="s">a&lt;b</script></svg>');
  });

  test("nested in other svg elements, components and sibling scripts", async () => {
    const C = () => script("c<d");
    const out = await renderToString(
      svg(jsx("g", { children: [script("a<b"), jsx(C, {}), jsx("circle", {})] })),
    );
    expect(out).toBe(
      "<svg><g><script>a&lt;b</script><script>c&lt;d</script><circle></circle></g></svg>",
    );
  });

  test("dynamic children: a promised script and a template under the svg", async () => {
    expect(await renderToString(svg(Promise.resolve(script("a<b"))))).toBe(
      "<svg><script>a&lt;b</script></svg>",
    );
    const Logo = () => jsxTemplateDeferred`<g>${script("a<b")}</g>`;
    expect(await renderToString(svg(jsx(Logo, {})))).toBe(
      "<svg><g><script>a&lt;b</script></g></svg>",
    );
  });

  test("a nested svg is escaped once, by its own element", async () => {
    expect(await renderToString(svg(svg(script("a<b"))))).toBe(
      "<svg><svg><script>a&lt;b</script></svg></svg>",
    );
  });

  test("content from raw() inside the body is rewritten too", async () => {
    expect(await renderToString(svg(script(raw("a<b>c"))))).toBe(
      "<svg><script>a&lt;b&gt;c</script></svg>",
    );
  });
});

describe("the scan of the svg content", () => {
  test("upper-case script tags, and a second script after a closed one", () => {
    expect(escapeForeignText("<SCRIPT>a<b</SCRIPT><g/><script>c<d</script>")).toBe(
      "<SCRIPT>a&lt;b</SCRIPT><g/><script>c&lt;d</script>",
    );
  });

  test("an unterminated body is escaped to the end", () => {
    expect(escapeForeignText("<script>a<b")).toBe("<script>a&lt;b");
  });

  test("a self-closing script has no body", () => {
    expect(escapeForeignText("<script src=x /><g><b>t</b></g>")).toBe(
      "<script src=x /><g><b>t</b></g>",
    );
  });

  test("a script in a foreignObject is an HTML script", () => {
    expect(
      escapeForeignText("<foreignObject><script>a<b</script></foreignObject><script>e<f</script>"),
    ).toBe("<foreignObject><script>a<b</script></foreignObject><script>e&lt;f</script>");
  });

  test("content without a script is returned as is", () => {
    const html = '<path d="M0 0"/><g><b>t</b></g>';
    expect(escapeForeignText(html)).toBe(html);
  });
});

describe("what stays as it was", () => {
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
});

describe("known limits (best effort, see security.mdx)", () => {
  test("an svg written in a template's text is not an svg element: not seen", async () => {
    expect(await renderToString(jsxTemplate`<svg><g>${script("a<b")}</g></svg>`)).toBe(
      "<svg><g><script>a<b</script></g></svg>",
    );
  });

  test("a root written only as text inside a root is not scanned", async () => {
    expect(await renderToString(svg(raw("<svg><script>a<b</script></svg>")))).toBe(
      "<svg><svg><script>a<b</script></svg></svg>",
    );
  });

  test("a tag written in a comment is read as a tag", () => {
    expect(escapeForeignText("<!-- <foreignObject> --><script>a<b</script>")).toBe(
      "<!-- <foreignObject> --><script>a<b</script>",
    );
  });
});

describe("style and integration points", () => {
  const PAYLOAD = "a{}<img src=x onerror=alert(1)>&amp;";
  const style = (children: unknown) => jsx("style", { children });

  test("style under svg: & < > are escaped", async () => {
    const esc = "a{}&lt;img src=x onerror=alert(1)&gt;&amp;amp;";
    expect(await renderToString(svg(style(PAYLOAD)))).toBe(`<svg><style>${esc}</style></svg>`);
  });

  test("HTML integration points keep their text as HTML", async () => {
    for (const tag of ["foreignObject", "desc", "title"]) {
      expect(await renderToString(svg(jsx(tag, { children: style(PAYLOAD) })))).toBe(
        `<svg><${tag}><style>${PAYLOAD}</style></${tag}></svg>`,
      );
    }
  });

  test("a style outside any root is untouched, and so is its sibling's root", async () => {
    expect(await renderToString([svg(style("a<b")), style("a<b")])).toBe(
      "<svg><style>a&lt;b</style></svg><style>a<b</style>",
    );
  });

  test("a nested root inside an integration point is escaped by its own element", async () => {
    const inner = jsx("foreignObject", { children: [style("a<b"), svg(style("a<b"))] });
    expect(await renderToString(svg(inner))).toBe(
      "<svg><foreignObject><style>a<b</style><svg><style>a&lt;b</style></svg></foreignObject></svg>",
    );
  });
});
