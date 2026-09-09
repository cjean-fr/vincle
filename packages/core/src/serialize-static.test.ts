import { describe, expect, test } from "bun:test";

import { jsx } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { isVoidElement, serializeStatic, isValidTag } from "./serialize.js";
import { VNode, RawString } from "./types.js";

/** A getter in props can re-enter `serializeStatic` while the outer call runs. */
describe("static serialization re-entrancy", () => {
  test("getter calls serializeStatic on a static tree → outer call unaffected", () => {
    const props = {
      get ["data-x"]() {
        // Inner call, static tree.
        const inner = serializeStatic("span", { children: "inner" });
        expect(inner).toBeInstanceOf(RawString);
        return "x";
      },
      children: "hello",
    };

    const result = serializeStatic("div", props);
    expect(result).toBeInstanceOf(RawString);
  });

  test("getter calls serializeStatic with a VNode → outer call unaffected", () => {
    // The inner call bails, and the outer one must still serialize its own
    // children: nothing carries the inner answer out.
    const props = {
      get ["data-x"]() {
        const inner = serializeStatic("div", { children: new VNode("span", {}, null) });
        expect(inner).toBeNull();
        return "x";
      },
      children: "hello",
    };

    const result = serializeStatic("div", props);
    // Outer call: children "hello" is static, getter returns static "x" —
    // the outer call must succeed and return a RawString.
    expect(result).toBeInstanceOf(RawString);
  });

  test("static tree", () => {
    expect(serializeStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
  });

  test("dynamic tree (VNode child)", () => {
    expect(serializeStatic("div", { children: new VNode("span", {}, null) })).toBeNull();
  });
});

/**
 * Tag validation — one gate, and it is `jsx()`.
 *
 * The rule being pinned has not changed: a name carrying a space or a quote closes
 * the start tag, and everything after it becomes markup. What changed is where it
 * is enforced. The static path checked the name, and so did each tree walk — three checks
 * for one answer, two of them unreachable through the public API, since a string
 * tag only ever enters the engine through `jsx()`. An unreachable
 * branch does not stay neutral, it drifts; and the price was paid on every element
 * of every render.
 *
 * So the check sits at the gate, and fires at construction: the earliest moment
 * at which the stack still points at the element the developer wrote. Both shapes
 * are exercised below — the one that would serialize, and the one that would reach the
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
      // Static children — the shape that would have been serialized to raw HTML.
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

  test("legitimate names still serialize", () => {
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
  test("<path /> serializes and renders with closing tag", async () => {
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

  test("SVG elements are NOT void elements", () => {
    // path, circle, use, line, rect, ellipse, polyline, polygon, stop
    // are all emptyable but NOT void — they accept <desc>/<animate> children.
    for (const tag of ["path", "circle", "use", "line", "rect", "ellipse", "polygon", "stop"]) {
      expect(isVoidElement(tag)).toBe(false);
      expect(isValidTag(tag)).toBe(true);
    }
  });
});

describe("sequential calls isolation", () => {
  test("dynamic then static", () => {
    expect(serializeStatic("div", { children: new VNode("span", {}, null) })).toBeNull();
    expect(serializeStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
  });

  test("static then dynamic", () => {
    expect(serializeStatic("div", { children: "hello" })).toBeInstanceOf(RawString);
    expect(serializeStatic("div", { children: new VNode("span", {}, null) })).toBeNull();
  });
});
