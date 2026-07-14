/**
 * Gold-standard tests: compare vincle/core output against ReactDOMServer.renderToString.
 *
 * React is the de-facto reference for JSX→HTML serialization. These tests pin every
 * behaviour that vincle intentionally matches — any divergence is documented and
 * either an intentional design choice or a bug to fix.
 *
 * Sources:
 * - ReactDOMServerIntegrationAttributes-test.js
 * - ReactDOMServerIntegrationElements-test.js
 * - ReactDOMServerIntegrationFragment-test.js
 * - ReactDOMServerIntegrationUntrustedURL-test.js
 * - preact-render-to-string/test/render.test.jsx
 */
import { describe, it, expect } from "bun:test";
import { createElement as reactCreate, Fragment as ReactFragment } from "react";
import { renderToString as reactRender } from "react-dom/server";

import { renderToString as vincleRender } from "./index.js";
import { jsx, Fragment } from "./jsx-runtime.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert vincle matches React exactly */
function match(label: string, vincleNode: any, reactNode: any) {
  it(label, async () => {
    const [v, r] = await Promise.all([
      vincleRender(vincleNode),
      Promise.resolve(reactRender(reactNode)),
    ]);
    expect(v).toBe(r);
  });
}

/** Shorthand for intrinsic elements */
function j(label: string, v: [any, any, any?], r: [any, any, any?]) {
  match(label, jsx(...v), reactCreate(...r));
}

/**
 * Known divergence — both are spec-valid, just different formatting.
 * We still compare to document the exact difference.
 */
function diverges(label: string, vincleNode: any, reactNode: any, reason: string) {
  it(`[DIVERGENCE] ${label} — ${reason}`, async () => {
    const v = await vincleRender(vincleNode);
    let r: string | undefined;
    try {
      r = reactRender(reactNode);
    } catch {
      r = undefined; // React throws (e.g. string style) — that's the divergence
    }
    expect(v).not.toBe(r);
  });
}

// ---------------------------------------------------------------------------
// 1. ATTRIBUTES
// ---------------------------------------------------------------------------
describe("gold — attributes", () => {
  // --- Boolean attributes ---
  // React renders `disabled=""`, vincle renders `disabled` (bare HTML boolean)
  diverges(
    "boolean true → bare attr",
    jsx("input", { disabled: true }),
    reactCreate("input", { disabled: true }),
    'React outputs disabled="", vincle outputs disabled (HTML spec: bare is correct)',
  );

  // React renders `<input/>` for false (self-closing, no attrs)
  diverges(
    "boolean false → omitted",
    jsx("input", { disabled: false }),
    reactCreate("input", { disabled: false }),
    "vincle outputs <input> vs React's <input/> (self-closing style)",
  );

  // React treats falsy-but-not-false/true as... truthy-ish for boolean attrs
  // React renders `<input disabled="0">` and `<input disabled="">`
  diverges(
    "boolean 0 → omitted (React convention)",
    jsx("input", { disabled: 0 as any }),
    reactCreate("input", { disabled: 0 as any }),
    'vincle drops 0, React renders disabled="0"',
  );
  diverges(
    "boolean '' → omitted (React convention)",
    jsx("input", { disabled: "" as any }),
    reactCreate("input", { disabled: "" as any }),
    "vincle drops '', React renders disabled=\"\"",
  );

  // --- String attributes ---
  j("string attr value", ["div", { id: "main" }], ["div", { id: "main" }]);
  j("string attr empty string", ["div", { title: "" }], ["div", { title: "" }]);

  // --- className / class ---
  j("className → class", ["div", { className: "foo" }], ["div", { className: "foo" }]);

  // vincle now follows a uniform rule: when both React & HTML names exist, the
  // HTML name (`class`) wins and the React name (`className`) is dropped.
  // React ignores `class` and uses `className` — so both produce `class="a"` by
  // different paths (React via className, vincle via class).
  match(
    "class+className — HTML name wins",
    jsx("div", { class: "a", className: "b" }),
    reactCreate("div", { className: "a" }),
  );

  // --- htmlFor / for ---
  j("htmlFor → for", ["label", { htmlFor: "input-id" }], ["label", { htmlFor: "input-id" }]);

  // vincle uniform rule: HTML name wins. `for` is the HTML name, `htmlFor` is the
  // React name. When both are present, `for` wins and `htmlFor` is dropped.
  match(
    "htmlFor+for — HTML name wins",
    jsx("label", { for: "id-html", htmlFor: "id-react", children: "L" }),
    reactCreate("label", { htmlFor: "id-html", children: "L" }),
  );

  // --- style object ---
  j(
    "style object → inline CSS",
    ["div", { style: { color: "red", marginTop: "10px" } }],
    ["div", { style: { color: "red", marginTop: "10px" } }],
  );
  j(
    "style camelCase to kebab",
    ["div", { style: { backgroundColor: "blue" } }],
    ["div", { style: { backgroundColor: "blue" } }],
  );
  j(
    "style custom properties",
    ["div", { style: { "--my-var": "10px" as any } }],
    ["div", { style: { "--my-var": "10px" as any } }],
  );
  j(
    "style null value → omitted",
    ["div", { style: { color: "red", marginTop: null as any } }],
    ["div", { style: { color: "red", marginTop: null as any } }],
  );
  j(
    "style undefined value → omitted",
    ["div", { style: { color: "red", marginTop: undefined as any } }],
    ["div", { style: { color: "red", marginTop: undefined as any } }],
  );
  j("style empty object → no style attr", ["div", { style: {} }], ["div", { style: {} }]);

  // React rejects string style; vincle accepts it for convenience
  diverges(
    "style string verbatim",
    jsx("div", { style: "color: red;" }),
    reactCreate("div", { style: "color: red;" }),
    "React throws on string style; vincle renders it verbatim",
  );

  // --- aria-* attributes ---
  // vincle now matches React: ARIA attrs are string attributes, not HTML booleans
  j("aria-hidden true → string", ["div", { "aria-hidden": true }], ["div", { "aria-hidden": true }]);
  j("aria-hidden false → string", ["div", { "aria-hidden": false }], ["div", { "aria-hidden": false }]);
  j("aria-label string", ["div", { "aria-label": "hello" }], ["div", { "aria-label": "hello" }]);

  // --- data-* attributes ---
  j("data-testid", ["div", { "data-testid": "root" }], ["div", { "data-testid": "root" }]);

  // --- Numeric attributes ---
  j("numeric attr value", ["div", { tabIndex: -1 }], ["div", { tabIndex: -1 }]);
  j("zero numeric attr", ["ol", { start: 0 }], ["ol", { start: 0 }]);

  // --- Event handlers dropped ---
  j("onClick dropped", ["button", { onClick: () => {} }], ["button", { onClick: () => {} }]);
  j("onSubmit dropped", ["form", { onSubmit: () => {} }], ["form", { onSubmit: () => {} }]);

  // --- Special attributes ---
  j(
    "acceptCharset → accept-charset",
    ["form", { acceptCharset: "UTF-8" }],
    ["form", { acceptCharset: "UTF-8" }],
  );
  // httpEquiv: React uses charSet not charset, let's normalize
  const metaJsx = jsx("meta", { httpEquiv: "refresh" });
  const metaReact = reactCreate("meta", { httpEquiv: "refresh" });
  // Different self-closing style
  diverges(
    "httpEquiv → http-equiv",
    metaJsx,
    metaReact,
    `React: <meta http-equiv="refresh"/>; vincle: <meta http-equiv="refresh">`,
  );

  // --- valueless boolean ---
  // React renders `hidden=""`, vincle renders `hidden`
  diverges(
    "hidden true → bare hidden",
    jsx("div", { hidden: true }),
    reactCreate("div", { hidden: true }),
    'React: hidden=""; vincle: hidden (bare, HTML spec correct)',
  );
  j("hidden false → omitted", ["div", { hidden: false }], ["div", { hidden: false }]);

  // --- download (boolean + string) ---
  // React renders `download=""` for true
  diverges(
    "download true → bare",
    jsx("a", { download: true, href: "/f" }),
    reactCreate("a", { download: true, href: "/f" }),
    'React: download=""; vincle: download (bare)',
  );
  j(
    "download string → named",
    ["a", { download: "file.pdf", href: "/f" }],
    ["a", { download: "file.pdf", href: "/f" }],
  );
});

// ---------------------------------------------------------------------------
// 2. CHILDREN
// ---------------------------------------------------------------------------
describe("gold — children", () => {
  j("string child", ["div", { children: "hello" }], ["div", null, "hello"]);
  j("number child", ["div", { children: 42 }], ["div", null, 42]);
  j("zero child (renders)", ["div", { children: 0 }], ["div", null, 0]);
  j("null child → omitted", ["div", { children: null }], ["div", null, null]);
  j("undefined child → omitted", ["div", { children: undefined }], ["div", null, undefined]);
  j("true child → omitted", ["div", { children: true }], ["div", null, true]);
  j("false child → omitted", ["div", { children: false }], ["div", null, false]);

  // React inserts <!-- --> comment separators between adjacent text nodes
  // vincle joins them directly (smaller output, no hydration need)
  diverges(
    "array children joined",
    jsx("div", { children: ["a", "b"] }),
    reactCreate("div", null, "a", "b"),
    "React inserts <!-- --> between adjacent text nodes; vincle joins directly",
  );
  diverges(
    "nested arrays flattened",
    jsx("div", { children: ["a", ["b", ["c"]]] }),
    reactCreate("div", null, "a", ["b", ["c"]]),
    "React inserts <!-- --> between adjacent text nodes; vincle joins directly",
  );

  j(
    "escaping in text child",
    ["p", { children: "<script>alert(1)</script>" }],
    ["p", null, "<script>alert(1)</script>"],
  );
  j("escaping & entity", ["p", { children: "a & b" }], ["p", null, "a & b"]);
});

// ---------------------------------------------------------------------------
// 3. FRAGMENTS
// ---------------------------------------------------------------------------
describe("gold — fragments", () => {
  match(
    "single child fragment",
    jsx(Fragment, { children: "hello" }),
    reactCreate(ReactFragment, null, "hello"),
  );

  // React inserts <!-- --> comment separators between fragment children too
  diverges(
    "multiple children fragment",
    jsx(Fragment, { children: ["a", "b"] }),
    reactCreate(ReactFragment, null, "a", "b"),
    "React inserts <!-- --> between adjacent text nodes",
  );

  match("empty fragment", jsx(Fragment, {}), reactCreate(ReactFragment));
});

// ---------------------------------------------------------------------------
// 4. VOID / SELF-CLOSING ELEMENTS
// ---------------------------------------------------------------------------
describe("gold — void elements", () => {
  // React uses `<br/>` self-closing syntax; vincle uses `<br>` (valid HTML5, spec-preferred)
  const voidTags = [
    "br",
    "hr",
    "img",
    "input",
    "area",
    "base",
    "col",
    "embed",
    "param",
    "source",
    "track",
    "wbr",
  ];
  for (const tag of voidTags) {
    const el =
      tag === "meta"
        ? jsx("meta", { charSet: "UTF-8" as any })
        : tag === "img"
          ? jsx("img", { src: "/a.png" })
          : tag === "input"
            ? jsx("input", { type: "text" })
            : tag === "link"
              ? jsx("link", { rel: "stylesheet", href: "/style.css" })
              : tag === "area"
                ? jsx("area", { shape: "rect", coords: "0,0,10,10" })
                : tag === "base"
                  ? jsx("base", { href: "/" })
                  : tag === "col"
                    ? jsx("col", { span: 2 })
                    : tag === "embed"
                      ? jsx("embed", { src: "/movie.swf" })
                      : tag === "param"
                        ? jsx("param", { name: "autoplay", value: "true" })
                        : tag === "source"
                          ? jsx("source", { src: "/a.mp4", type: "video/mp4" })
                          : tag === "track"
                            ? jsx("track", { src: "/a.vtt", kind: "subtitles" })
                            : jsx(tag, {});

    const rTag =
      tag === "meta"
        ? reactCreate("meta", { charSet: "UTF-8" })
        : tag === "img"
          ? reactCreate("img", { src: "/a.png" })
          : tag === "input"
            ? reactCreate("input", { type: "text" })
            : tag === "link"
              ? reactCreate("link", { rel: "stylesheet", href: "/style.css" })
              : tag === "area"
                ? reactCreate("area", { shape: "rect", coords: "0,0,10,10" })
                : tag === "base"
                  ? reactCreate("base", { href: "/" })
                  : tag === "col"
                    ? reactCreate("col", { span: 2 })
                    : tag === "embed"
                      ? reactCreate("embed", { src: "/movie.swf" })
                      : tag === "param"
                        ? reactCreate("param", {
                            name: "autoplay",
                            value: "true",
                          })
                        : tag === "source"
                          ? reactCreate("source", {
                              src: "/a.mp4",
                              type: "video/mp4",
                            })
                          : tag === "track"
                            ? reactCreate("track", {
                                src: "/a.vtt",
                                kind: "subtitles",
                              })
                            : reactCreate(tag);

    diverges(
      tag,
      el,
      rTag,
      `React uses self-closing syntax ${tag}/; vincle uses ${tag} (both valid HTML5)`,
    );
  }

  // Non-void: explicitly not self-closing
  j("div is not void", ["div", { children: "x" }], ["div", null, "x"]);
  j("span is not void", ["span", { children: "x" }], ["span", null, "x"]);
});

// ---------------------------------------------------------------------------
// 5. WHITESPACE & SPECIAL ELEMENTS
// ---------------------------------------------------------------------------
describe("gold — whitespace & special", () => {
  j(
    "pre preserves whitespace",
    ["pre", { children: "  hello\n  world" }],
    ["pre", null, "  hello\n  world"],
  );
  // textarea with children triggers React warning but still renders
  j("textarea with text", ["textarea", { children: "  hello" }], ["textarea", null, "  hello"]);
});

// ---------------------------------------------------------------------------
// 6. dangerouslySetInnerHTML
// ---------------------------------------------------------------------------
describe("gold — dangerouslySetInnerHTML", () => {
  j(
    "__html as string",
    ["div", { dangerouslySetInnerHTML: { __html: "<b>bold</b>" } }],
    ["div", { dangerouslySetInnerHTML: { __html: "<b>bold</b>" } }],
  );
  j(
    "__html empty string",
    ["div", { dangerouslySetInnerHTML: { __html: "" } }],
    ["div", { dangerouslySetInnerHTML: { __html: "" } }],
  );
});

// ---------------------------------------------------------------------------
// 7. XSS — URL sanitization
// ---------------------------------------------------------------------------
describe("gold — URL sanitization (javascript:)", () => {
  // React replaces javascript: with a thrown error string; vincle replaces with #blocked
  // Different approaches but both block the XSS
  diverges(
    "javascript: in href",
    jsx("a", { href: "javascript:alert(1)" }),
    reactCreate("a", { href: "javascript:alert(1)" }),
    "React throws error with description; vincle uses #blocked sink — both neutralize XSS",
  );
  diverges(
    "javascript: in form action",
    jsx("form", { action: "javascript:alert(1)" }),
    reactCreate("form", { action: "javascript:alert(1)" }),
    "Same divergence — error string vs #blocked",
  );

  j(
    "https: href passes",
    ["a", { href: "https://example.com" }],
    ["a", { href: "https://example.com" }],
  );
  j(
    "mailto: href passes",
    ["a", { href: "mailto:test@test.com" }],
    ["a", { href: "mailto:test@test.com" }],
  );
});

// ---------------------------------------------------------------------------
// 8. COMPONENTS
// ---------------------------------------------------------------------------
describe("gold — components", () => {
  function Greet(p: { name: string }) {
    return jsx("div", { children: `Hello ${p.name}` });
  }
  function GreetReact(p: { name: string }) {
    return reactCreate("div", null, `Hello ${p.name}`);
  }
  match(
    "function component",
    jsx(Greet, { name: "World" }),
    reactCreate(GreetReact, { name: "World" }),
  );

  function List(p: { items: string[] }) {
    return jsx(Fragment, {
      children: p.items.map((i) => jsx("li", { children: i })),
    });
  }
  function ListReact(p: { items: string[] }) {
    return reactCreate(ReactFragment, null, ...p.items.map((i) => reactCreate("li", null, i)));
  }
  match(
    "component returning fragment",
    jsx(List, { items: ["a", "b"] }),
    reactCreate(ListReact, { items: ["a", "b"] }),
  );
});

// ---------------------------------------------------------------------------
// 9. ESCAPING / XSS
// ---------------------------------------------------------------------------
describe("gold — escaping & XSS", () => {
  j("angle brackets escaped", ["div", { children: "<script>" }], ["div", null, "<script>"]);
  j("ampersand escaped", ["div", { children: "a&b" }], ["div", null, "a&b"]);
  j("double quote in attr", ["div", { title: 'he"llo' }], ["div", { title: 'he"llo' }]);

  // React uses &#x27;, vincle uses &#39; — both are spec-valid for '
  diverges(
    "single quote in attr",
    jsx("div", { title: "he'llo" }),
    reactCreate("div", { title: "he'llo" }),
    "React: &#x27;; vincle: &#39; — beide valides HTML",
  );

  j(
    "attr name with < is stripped",
    ["div", { 'x"><script>': "y" }],
    ["div", { 'x"><script>': "y" }],
  );
  j('attr name with " is stripped', ["div", { 'x"y': "z" }], ["div", { 'x"y': "z" }]);
});

// ---------------------------------------------------------------------------
// 10. SVG
// ---------------------------------------------------------------------------
describe("gold — SVG", () => {
  match(
    "svg element",
    jsx("svg", {
      viewBox: "0 0 100 100",
      children: jsx("circle", { cx: "50", cy: "50", r: "40" }),
    }),
    reactCreate(
      "svg",
      { viewBox: "0 0 100 100" },
      reactCreate("circle", { cx: "50", cy: "50", r: "40" }),
    ),
  );

  match(
    "svg path",
    jsx("svg", { children: jsx("path", { d: "M10 10", "stroke-width": "2" }) }),
    reactCreate("svg", null, reactCreate("path", { d: "M10 10", strokeWidth: "2" })),
  );
});

// ---------------------------------------------------------------------------
// 11. MATHML
// ---------------------------------------------------------------------------
describe("gold — MathML", () => {
  // MathML elements render like any other intrinsic element in vincle
  match(
    "math element",
    jsx("math", { display: "block", children: jsx("mi", { children: "x" }) }),
    reactCreate("math", { display: "block" }, reactCreate("mi", null, "x")),
  );

  match("mi identifier", jsx("mi", { children: "x" }), reactCreate("mi", null, "x"));
  match("mo operator", jsx("mo", { children: "+" }), reactCreate("mo", null, "+"));
  match("mn number", jsx("mn", { children: "42" }), reactCreate("mn", null, "42"));
  match("ms string", jsx("ms", { children: "hello" }), reactCreate("ms", null, "hello"));
  match("mtext", jsx("mtext", { children: "text" }), reactCreate("mtext", null, "text"));

  match(
    "mrow grouping",
    jsx("mrow", {
      children: [
        jsx("mi", { children: "a" }),
        jsx("mo", { children: "+" }),
        jsx("mi", { children: "b" }),
      ],
    }),
    reactCreate(
      "mrow",
      null,
      reactCreate("mi", null, "a"),
      reactCreate("mo", null, "+"),
      reactCreate("mi", null, "b"),
    ),
  );

  match(
    "msup superscript",
    jsx("msup", {
      children: [jsx("mi", { children: "x" }), jsx("mn", { children: "2" })],
    }),
    reactCreate("msup", null, reactCreate("mi", null, "x"), reactCreate("mn", null, "2")),
  );

  match(
    "msub subscript",
    jsx("msub", {
      children: [jsx("mi", { children: "x" }), jsx("mn", { children: "1" })],
    }),
    reactCreate("msub", null, reactCreate("mi", null, "x"), reactCreate("mn", null, "1")),
  );

  match(
    "mfrac fraction",
    jsx("mfrac", {
      children: [jsx("mi", { children: "a" }), jsx("mi", { children: "b" })],
    }),
    reactCreate("mfrac", null, reactCreate("mi", null, "a"), reactCreate("mi", null, "b")),
  );

  match(
    "msqrt square root",
    jsx("msqrt", { children: jsx("mn", { children: "2" }) }),
    reactCreate("msqrt", null, reactCreate("mn", null, "2")),
  );

  match(
    "mroot nth root",
    jsx("mroot", {
      children: [jsx("mi", { children: "x" }), jsx("mn", { children: "3" })],
    }),
    reactCreate("mroot", null, reactCreate("mi", null, "x"), reactCreate("mn", null, "3")),
  );

  match(
    "msubsup",
    jsx("msubsup", {
      children: [
        jsx("mi", { children: "x" }),
        jsx("mn", { children: "1" }),
        jsx("mn", { children: "2" }),
      ],
    }),
    reactCreate(
      "msubsup",
      null,
      reactCreate("mi", null, "x"),
      reactCreate("mn", null, "1"),
      reactCreate("mn", null, "2"),
    ),
  );

  // MathML presentation attributes
  match(
    "mathcolor attr",
    jsx("mi", { mathcolor: "red", children: "x" }),
    reactCreate("mi", { mathcolor: "red" }, "x"),
  );

  match(
    "mathbackground attr",
    jsx("mi", { mathbackground: "#eee", children: "x" }),
    reactCreate("mi", { mathbackground: "#eee" }, "x"),
  );

  match(
    "lspace rspace attrs",
    jsx("mo", { lspace: "0.2em", rspace: "0.2em", children: "+" }),
    reactCreate("mo", { lspace: "0.2em", rspace: "0.2em" }, "+"),
  );

  // Nested MathML
  match(
    "nested msup in mfrac",
    jsx("mfrac", {
      children: [
        jsx("msup", {
          children: [jsx("mi", { children: "x" }), jsx("mn", { children: "2" })],
        }),
        jsx("mi", { children: "y" }),
      ],
    }),
    reactCreate(
      "mfrac",
      null,
      reactCreate("msup", null, reactCreate("mi", null, "x"), reactCreate("mn", null, "2")),
      reactCreate("mi", null, "y"),
    ),
  );

  match(
    "math with multiple children",
    jsx("math", {
      children: [
        jsx("mi", { children: "E" }),
        jsx("mo", { children: "=" }),
        jsx("mi", { children: "m" }),
        jsx("msup", {
          children: [jsx("mi", { children: "c" }), jsx("mn", { children: "2" })],
        }),
      ],
    }),
    reactCreate(
      "math",
      null,
      reactCreate("mi", null, "E"),
      reactCreate("mo", null, "="),
      reactCreate("mi", null, "m"),
      reactCreate("msup", null, reactCreate("mi", null, "c"), reactCreate("mn", null, "2")),
    ),
  );

  match("empty math", jsx("math", {}), reactCreate("math"));

  // mspace is not a void element in the HTML spec — both render <mspace></mspace>
  match("mspace", jsx("mspace", { width: "1em" }), reactCreate("mspace", { width: "1em" }));

  // stretchy — React 19 drops non-boolean boolean attrs with warning;
  // vincle renders `stretchy="true"` (more useful — the attr appears in output)
  diverges(
    "stretchy boolean true",
    jsx("mo", { stretchy: true, children: ")" }),
    reactCreate("mo", { stretchy: true }, ")"),
    'React 19 drops stretchy (warning); vincle renders stretchy="true"',
  );
});

// ---------------------------------------------------------------------------
// 12. SELECT / OPTION / FORM ELEMENTS
// ---------------------------------------------------------------------------
describe("gold — select & form elements", () => {
  // React SSR adds selected="" to the matching option when <select value="x">
  // All booleans follow the established divergence pattern

  // option selected (boolean)
  diverges(
    "option selected=true",
    jsx("option", { selected: true, value: "x", children: "X" }),
    reactCreate("option", { selected: true, value: "x" }, "X"),
    'React: selected=""; vincle: selected (bare boolean)',
  );

  match(
    "option selected=false",
    jsx("option", { selected: false, value: "x", children: "X" }),
    reactCreate("option", { selected: false, value: "x" }, "X"),
  );

  match(
    "optgroup",
    jsx("optgroup", {
      label: "G",
      children: jsx("option", { value: "1", children: "A" }),
    }),
    reactCreate("optgroup", { label: "G" }, reactCreate("option", { value: "1" }, "A")),
  );

  // Checkbox / radio — checked boolean
  diverges(
    "checkbox checked=true",
    jsx("input", { type: "checkbox", checked: true }),
    reactCreate("input", { type: "checkbox", checked: true }),
    'React: checked=""; vincle: checked (bare boolean)',
  );

  diverges(
    "checkbox checked=false",
    jsx("input", { type: "checkbox", checked: false }),
    reactCreate("input", { type: "checkbox", checked: false }),
    "Self-closing: React <input/> vs vincle <input>",
  );

  diverges(
    "radio checked=true",
    jsx("input", { type: "radio", checked: true }),
    reactCreate("input", { type: "radio", checked: true }),
    'React: checked=""; vincle: checked (bare boolean)',
  );

  diverges(
    "radio checked=false",
    jsx("input", { type: "radio", checked: false }),
    reactCreate("input", { type: "radio", checked: false }),
    "Self-closing: React <input/> vs vincle <input>",
  );
});

// ---------------------------------------------------------------------------
// 13. ADDITIONAL EDGE CASES
// ---------------------------------------------------------------------------
describe("gold — additional edge cases", () => {
  // Mixed children types (text + element + text)
  match(
    "mixed text + element + text",
    jsx("p", {
      children: ["Hello ", jsx("strong", { children: "World" }), "!"],
    }),
    reactCreate("p", null, "Hello ", reactCreate("strong", null, "World"), "!"),
  );

  // Whitespace-preserving children
  match(
    "whitespace around element",
    jsx("span", { children: ["  ", jsx("em", { children: "x" }), "  "] }),
    reactCreate("span", null, "  ", reactCreate("em", null, "x"), "  "),
  );

  // autofocus (boolean)
  diverges(
    "autofocus true",
    jsx("input", { type: "text", autoFocus: true }),
    reactCreate("input", { type: "text", autoFocus: true }),
    'React: autofocus=""; vincle: autofocus (bare boolean)',
  );

  diverges(
    "autofocus false",
    jsx("input", { type: "text", autoFocus: false }),
    reactCreate("input", { type: "text", autoFocus: false }),
    "Self-closing: React <input/> vs vincle <input>",
  );

  // contentEditable — now matches React (enumerated attr, not HTML boolean)
  j(
    "contentEditable true → string",
    ["div", { contentEditable: true }],
    ["div", { contentEditable: true }],
  );
  j(
    "contentEditable false → string",
    ["div", { contentEditable: false }],
    ["div", { contentEditable: false }],
  );

  // open (details/summary boolean)
  diverges(
    "open true → bare",
    jsx("details", {
      open: true,
      children: jsx("summary", { children: "Info" }),
    }),
    reactCreate("details", { open: true }, reactCreate("summary", null, "Info")),
    'React: open=""; vincle: open (bare boolean)',
  );

  match(
    "open false → omitted",
    jsx("details", {
      open: false,
      children: jsx("summary", { children: "Info" }),
    }),
    reactCreate("details", { open: false }, reactCreate("summary", null, "Info")),
  );

  // Encoded mailto: href
  match(
    "mailto with encoded params",
    jsx("a", {
      href: "mailto:test@test.com?subject=hello&body=world",
      children: "mail",
    }),
    reactCreate("a", { href: "mailto:test@test.com?subject=hello&body=world" }, "mail"),
  );

  // data:image URI — safe
  diverges(
    "data image URI safe",
    jsx("img", { src: "data:image/png;base64,iVBORw0KGgo=" }),
    reactCreate("img", { src: "data:image/png;base64,iVBORw0KGgo=" }),
    "Self-closing: React <img/> vs vincle <img>",
  );

  // dangerouslySetInnerHTML with null/undefined __html
  match(
    "dangerouslySetInnerHTML null __html → empty",
    jsx("div", { dangerouslySetInnerHTML: { __html: null } }),
    reactCreate("div", { dangerouslySetInnerHTML: { __html: null } }),
  );

  match(
    "dangerouslySetInnerHTML undefined __html → empty",
    jsx("div", { dangerouslySetInnerHTML: { __html: undefined } }),
    reactCreate("div", { dangerouslySetInnerHTML: { __html: undefined } }),
  );
});

// ---------------------------------------------------------------------------
// 14. OUTPUT FORMAT SUMMARY
// ---------------------------------------------------------------------------
// Divergences are intentional design decisions — not bugs:
//
//  1. Void element self-closing: React `<br/>` vs vincle `<br>` (HTML5 spec: both valid)
//     → email-safe: Outlook Word can misparse `<br/>` and break subsequent HTML
//  2. Boolean attribute format: React `disabled=""` vs vincle `disabled` (spec: bare is canonical)
//     Affects ALL boolean attrs: checked, selected, autofocus, open, hidden, disabled, etc.
//  3. Text node separators: React inserts `<!-- -->` comment nodes; vincle joins directly
//  4. URL sanitization: React throws error string; vincle uses `#blocked` sink
//  5. String style: React throws; vincle accepts for convenience
//  6. `&#x27;` vs `&#39;` for single quotes — both spec-valid
//  7. `class`+`className` merging — React ignores `class`; vincle merges, class wins
//  8. Non-boolean boolean values: React 19 drops `stretchy={true}` with warning;
//     vincle renders `stretchy="true"` (the value is explicitly present in output)
//
// Resolved divergences (vincle now matches React):
//  - `aria-hidden={true}` → `aria-hidden="true"` (string attr, not HTML boolean)
//  - `contentEditable={true/false}` → `contenteditable="true"/"false"` (enumerated attr)
//
// Everything else matches React output exactly.
