import { describe, expect, test } from "bun:test";

import { jsx, jsxTemplate } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { escapeSvgScripts } from "./svg-script.js";
import { raw } from "./types.js";

const script = (children: unknown, props: Record<string, unknown> = {}) =>
  jsx("script", { ...props, children });
const svg = (children: unknown) => jsx("svg", { children });

describe("script under <svg>", () => {
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
    expect(out).toBe("<svg><script>a&lt;img src=x onerror=alert(1)></script></svg>");
    expect(out).not.toContain("<img");
  });

  test("the closing tag is the only < left", async () => {
    const out = await renderToString(svg(script("a<b")));
    expect(out.match(/</g)?.length).toBe(4); // <svg> <script> </script> </svg>
  });

  test("a closer-like sequence in the text was already neutralized", async () => {
    // The HTML-boundary rule makes it `\u003c/script>`; the rest is escaped here.
    expect(await renderToString(svg(script("a</script><img>")))).toBe(
      "<svg><script>a\\u003c/script>&lt;img></script></svg>",
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

  test("a template with the svg in its text is covered too", async () => {
    expect(await renderToString(jsxTemplate`<svg><g>${script("a<b")}</g></svg>`)).toBe(
      "<svg><g><script>a&lt;b</script></g></svg>",
    );
  });

  test("content from raw() inside the body is rewritten too", async () => {
    expect(await renderToString(svg(script(raw("a<b>c"))))).toBe(
      "<svg><script>a&lt;b>c</script></svg>",
    );
  });

  test("upper-case svg and script tags in raw output", () => {
    expect(escapeSvgScripts("<SVG><SCRIPT>a<b</SCRIPT></SVG>")).toBe(
      "<SVG><SCRIPT>a&lt;b</SCRIPT></SVG>",
    );
  });

  test("a second svg after the first one closed", () => {
    expect(escapeSvgScripts("<svg></svg><script>a<b</script><svg><script>a<b</script></svg>")).toBe(
      "<svg></svg><script>a<b</script><svg><script>a&lt;b</script></svg>",
    );
  });

  test("an unterminated body is escaped to the end", () => {
    expect(escapeSvgScripts("<svg><script>a<b")).toBe("<svg><script>a&lt;b");
  });

  test("a self-closing script has no body", () => {
    expect(escapeSvgScripts("<svg><script src=x /><g><b>t</b></g></svg>")).toBe(
      "<svg><script src=x /><g><b>t</b></g></svg>",
    );
  });
});

describe("what stays as it was", () => {
  test("HTML scripts outside svg", async () => {
    expect(await renderToString(script("if (a<b) {}"))).toBe("<script>if (a<b) {}</script>");
    expect(await renderToString(jsx("div", { children: script("a<b") }))).toBe(
      "<div><script>a<b</script></div>",
    );
    expect(escapeSvgScripts("<script>a<b</script><svg></svg><script>a<b</script>")).toBe(
      "<script>a<b</script><svg></svg><script>a<b</script>",
    );
  });

  test("an HTML script inside a foreignObject", async () => {
    const out = await renderToString(svg(jsx("foreignObject", { children: script("a<b") })));
    expect(out).toBe("<svg><foreignObject><script>a<b</script></foreignObject></svg>");
    expect(
      escapeSvgScripts(
        "<svg><foreignObject><script>a<b</script><svg><script>c<d</script></svg></foreignObject><script>e<f</script></svg>",
      ),
    ).toBe(
      "<svg><foreignObject><script>a<b</script><svg><script>c&lt;d</script></svg></foreignObject><script>e&lt;f</script></svg>",
    );
  });

  test("style under svg and everything under math are not touched here", async () => {
    expect(await renderToString(svg(jsx("style", { children: "a<b" })))).toBe(
      "<svg><style>a<b</style></svg>",
    );
    expect(await renderToString(jsx("math", { children: script("a<b") }))).toBe(
      "<math><script>a<b</script></math>",
    );
  });

  test("a page without svg is returned as is, same string", () => {
    const html = "<div><script>a<b</script></div>";
    expect(escapeSvgScripts(html)).toBe(html);
  });

  test("an svg without script is returned as is", () => {
    const html = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
    expect(escapeSvgScripts(html)).toBe(html);
  });
});

describe("known limits (best effort, see security.mdx)", () => {
  test("&amp; is not touched: only < is in scope", async () => {
    expect(await renderToString(svg(script("a&&b")))).toBe("<svg><script>a&&b</script></svg>");
  });

  test("a mixed-case <Svg is not seen by the gate", () => {
    expect(escapeSvgScripts("<Svg><script>a<b</script></Svg>")).toBe(
      "<Svg><script>a<b</script></Svg>",
    );
  });

  test("a tag written in a comment is read as a tag", () => {
    // `<!-- <svg> -->` opens a context for this scan, the parser sees a comment.
    expect(escapeSvgScripts("<!-- <svg> --><script>a<b</script>")).toBe(
      "<!-- <svg> --><script>a&lt;b</script>",
    );
  });
});
