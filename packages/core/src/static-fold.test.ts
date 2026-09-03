import { describe, expect, test } from "bun:test";

import { jsx, VNode } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { tryRenderStatic, VOID_ELEMENTS, isValidTag } from "./serialize.js";
import { RawString } from "./types.js";

/** A getter in props can re-enter `tryRenderStatic` while the outer fold runs. */
describe("fold re-entrancy", () => {
  test("getter calls tryRenderStatic on a static tree → outer fold unaffected", () => {
    const props = {
      get ["data-x"]() {
        // Inner tryRenderStatic, static tree.
        const inner = tryRenderStatic("span", { children: "inner" });
        expect(inner).toBeInstanceOf(RawString);
        return "x";
      },
      children: "hello",
    };

    const result = tryRenderStatic("div", props);
    expect(result).toBeInstanceOf(RawString);
  });

  test("getter calls tryRenderStatic with a VNode → outer fold unaffected", () => {
    // The inner call declines, and the outer one must still fold its own
    // children: nothing carries the inner answer out.
    const props = {
      get ["data-x"]() {
        const inner = tryRenderStatic("div", { children: new VNode("span", {}, null) });
        expect(inner).toBeNull();
        return "x";
      },
      children: "hello",
    };

    const result = tryRenderStatic("div", props);
    // Outer call: children "hello" is static, getter returns static "x" —
    // the fold must succeed and return a RawString.
    expect(result).toBeInstanceOf(RawString);
  });

  test("static tree", () => {
    expect(tryRenderStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
  });

  test("dynamic tree (VNode child)", () => {
    expect(tryRenderStatic("div", { children: new VNode("span", {}, null) })).toBeNull();
  });
});

/**
 * Tag validation — one gate, and it is `jsx()`.
 *
 * The rule being pinned has not changed: a name carrying a space or a quote closes
 * the start tag, and everything after it becomes markup. What changed is where it
 * is enforced. The fold checked the name, and so did each tree walk — three checks
 * for one answer, two of them unreachable through the public API, since a string
 * tag only ever enters the engine through `jsx()`. An unreachable
 * branch does not stay neutral, it drifts; and the price was paid on every element
 * of every render.
 *
 * So the check sits at the gate, and fires at construction: the earliest moment
 * at which the stack still points at the element the developer wrote. Both shapes
 * are exercised below — the one that would fold, and the one that would reach the
 * tree walk — because the guarantee is that *neither* gets through.
 */
describe("tag validation — jsx() is the single gate", () => {
  const INVALID = [
    "div onload=alert(1)",
    'div"',
    "div>",
    "div<script",
    "div/",
    "div=",
    "",
    "!doctype",
    "?xml",
    "div ",
  ];

  for (const tag of INVALID) {
    test(`rejects ${JSON.stringify(tag)}`, () => {
      // Static children — the shape that would have been folded to raw HTML.
      expect(() => jsx(tag, { children: "hello" })).toThrow(/\[vincle\/core\] Invalid tag name/);
      // Dynamic children — the shape that would have reached the tree walk.
      expect(() => jsx(tag, { children: Promise.resolve("hello") })).toThrow(
        /\[vincle\/core\] Invalid tag name/,
      );
    });
  }

  test("the rejection quotes the offending tag verbatim", () => {
    expect(() => jsx("div onload=x", {})).toThrow('Invalid tag name "div onload=x"');
  });

  test("legitimate names still fold", () => {
    for (const tag of ["div", "my-element", "svg:rect", "h1", "data-x"]) {
      expect(jsx(tag, { children: "ok" })).toBeInstanceOf(RawString);
    }
  });
});

// ── SVG / Foreign elements ─────────────────────────────────────────────────
//
// SVG and MathML elements are "foreign elements" per the HTML5 spec. They are
// NOT void elements — they MUST have either a start tag + end tag, or a
// self-closing start tag (`<path/>`). Vincle always emits closing tags for
// non-void elements, which is valid HTML5 per the spec's serialization
// algorithm (foreign elements with closing tags are always correct).
//
// Additionally, SVG attribute names are case-sensitive in foreign content
// (unlike HTML where they are case-insensitive). Vincle preserves attribute
// names as-is when they have no uppercase React alias (e.g. `viewBox` stays
// `viewBox` because it has uppercase but no React mapping).

describe("SVG foreign elements render with closing tags (not void)", () => {
  test("<path /> folds and renders with closing tag", async () => {
    const node = jsx("path", { d: "M0 0h10v10z" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe('<path d="M0 0h10v10z"></path>');
  });

  test("<circle> with children renders wrapping them", async () => {
    const node = jsx("circle", {
      cx: "50",
      cy: "50",
      r: "40",
      children: jsx("desc", { children: "A circle" }),
    });
    // children → dynamic (nested child tree that is itself static)
    // jsx returns RawString because the subtree is fully static
    expect(await renderToString(node)).toBe(
      '<circle cx="50" cy="50" r="40"><desc>A circle</desc></circle>',
    );
  });

  test("<svg> wrapper with mixed SVG children", async () => {
    const node = jsx("svg", {
      viewBox: "0 0 100 100",
      xmlns: "http://www.w3.org/2000/svg",
      children: [
        jsx("circle", { cx: "50", cy: "50", r: "40", fill: "red" }),
        jsx("path", { d: "M0 0h10v10z", fill: "blue" }),
      ],
    });
    const html = await renderToString(node);
    expect(html).toContain('<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">');
    expect(html).toContain('<circle cx="50" cy="50" r="40" fill="red"></circle>');
    expect(html).toContain('<path d="M0 0h10v10z" fill="blue"></path>');
    expect(html).toContain("</svg>");
  });

  test("SVG elements are NOT in VOID_ELEMENTS", () => {
    // path, circle, use, line, rect, ellipse, polyline, polygon, stop
    // are all emptyable but NOT void — they accept <desc>/<animate> children.
    for (const tag of ["path", "circle", "use", "line", "rect", "ellipse", "polygon", "stop"]) {
      expect(VOID_ELEMENTS.has(tag)).toBe(false);
      expect(isValidTag(tag)).toBe(true);
    }
  });
});

describe("sequential calls isolation", () => {
  test("dynamic then static", () => {
    expect(tryRenderStatic("div", { children: new VNode("span", {}, null) })).toBeNull();
    expect(tryRenderStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
  });

  test("static then dynamic", () => {
    expect(tryRenderStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
    expect(tryRenderStatic("div", { children: new VNode("span", {}, null) })).toBeNull();
  });
});
