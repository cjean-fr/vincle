import { describe, expect, test } from "bun:test";

import { ATTR_NAME_TABLES, buildAttrs, isValidAttrName, resolveAttrName } from "./attrs.js";
import { raw } from "./types.js";

describe("buildAttrs URL safety", () => {
  test("blocks javascript: href", () => {
    const r = buildAttrs({ href: "javascript:alert(1)" });
    expect(r).toContain("#blocked");
  });

  test("allows http href", () => {
    const r = buildAttrs({ href: "https://example.com" });
    expect(r).toContain("https://example.com");
  });

  test("allows relative href", () => {
    expect(buildAttrs({ href: "/page" })).toContain("/page");
    expect(buildAttrs({ href: "#section" })).toContain("#section");
  });

  test("non-URL attr is not checked", () => {
    const r = buildAttrs({ id: "javascript:fine" });
    expect(r).toContain("javascript:fine");
  });

  test("blocks javascript: src", () => {
    const r = buildAttrs({ src: "javascript:alert(1)" });
    expect(r).toContain("#blocked");
  });

  test("className is resolved before URL check", () => {
    const r = buildAttrs({ className: "foo" });
    expect(r).toContain('class="foo"');
  });

  test("blocks vbscript: href", () => {
    const r = buildAttrs({ href: "vbscript:msgbox(1)" });
    expect(r).toContain("#blocked");
  });

  test("blocks javascript: action", () => {
    const r = buildAttrs({ action: "javascript:alert(1)" });
    expect(r).toContain("#blocked");
  });

  test("blocks javascript: formaction", () => {
    const r = buildAttrs({ formaction: "javascript:alert(1)" });
    expect(r).toContain("#blocked");
  });

  test("xlink:href is blocked (SVG <a> execution vector)", () => {
    const r = buildAttrs({ xlinkHref: "javascript:alert(1)" });
    expect(r).toContain("#blocked");
  });

  test("srcset is not checked (no JS execution vector)", () => {
    const r = buildAttrs({ srcSet: "javascript:alert(1) 1x" });
    expect(r).toContain('srcset="javascript:alert(1) 1x"');
  });

  test("RawString bypasses URL safety", () => {
    const r = buildAttrs({ href: raw("javascript:fn()") });
    expect(r).toContain('href="javascript:fn()"');
    expect(r).not.toContain("#blocked");
  });

  test("mailto: href passes through", () => {
    const r = buildAttrs({ href: "mailto:user@example.com" });
    expect(r).toContain("mailto:user@example.com");
  });

  test("data:image href passes through", () => {
    const r = buildAttrs({ href: "data:image/png;base64,abc" });
    expect(r).toContain("data:image/png;base64,abc");
  });

  test("non-image data: URI is blocked", () => {
    const r = buildAttrs({ href: "data:text/html,<script>alert(1)</script>" });
    expect(r).toContain("#blocked");
  });

  test("blocks scheme obfuscated with tab / leading NUL", () => {
    expect(buildAttrs({ href: "java\tscript:alert(1)" })).toContain("#blocked");
    expect(buildAttrs({ href: "\0javascript:alert(1)" })).toContain("#blocked");
    expect(buildAttrs({ src: "java\nscript:alert(1)" })).toContain("#blocked");
  });

  test("blocks javascript: on <object data>", () => {
    expect(buildAttrs({ data: "javascript:alert(1)" })).toContain("#blocked");
    expect(buildAttrs({ data: "/model.json" })).toContain('data="/model.json"');
  });
});

// ── React alias collision ──────────────────────────────────────────────────

describe("buildAttrs alias resolution", () => {
  test("native name wins over its React alias", () => {
    const r = buildAttrs({ className: "from-alias", class: "from-native" });
    expect(r).toBe(' class="from-native"');
  });

  // `attrName in attrs` walked the prototype chain, so a resolved name that
  // happens to be an `Object.prototype` key looked like an existing native prop
  // and the attribute was dropped with no output and no error.
  test("a name resolving onto Object.prototype is still emitted", () => {
    expect(buildAttrs({ Constructor: "x" })).toBe(' constructor="x"');
    expect(buildAttrs({ __Proto__: "x" })).toBe(' __proto__="x"');
    expect(buildAttrs({ ToString: "x" })).toBe(' tostring="x"');
  });
});

// ── Style objects ──────────────────────────────────────────────────────────

describe("buildAttrs style", () => {
  test("camelCase is kebab-cased", () => {
    expect(buildAttrs({ style: { backgroundColor: "red" } })).toBe(' style="background-color:red"');
  });

  // A key carrying `:` or `;` smuggled extra declarations into the attribute.
  test("property names carrying CSS syntax are dropped", () => {
    expect(buildAttrs({ style: { "color:red;position": "fixed" } })).toBe("");
    expect(buildAttrs({ style: { color: "red", "a;b": "c" } })).toBe(' style="color:red"');
    expect(buildAttrs({ style: { "}html{display": "none" } })).toBe("");
  });

  test("values are left alone — only names are a closed vocabulary", () => {
    expect(buildAttrs({ style: { color: "red;position:fixed" } })).toBe(
      ' style="color:red;position:fixed"',
    );
  });

  test("custom properties survive", () => {
    expect(buildAttrs({ style: { "--brand": "#0af" } })).toBe(' style="--brand:#0af"');
  });
});

// ── Attribute name resolution ──────────────────────────────────────────────
//
// `resolveAttrName` is the single authority on what an attribute is *called* in
// the document, and `@vincle/precompile-core` re-exports it to inline names at
// build time. It had no test at all: a wrong entry, or a missing one, produced an
// attribute the browser ignores — no error, no visible failure, just a style that
// never applied. That is how seventy SVG presentation attributes came to be
// emitted as `strokewidth`.
//
// The expectations below are written by hand from the specs. That matters: the
// hyphenated table derives its values with `camelToKebab`, so a test that derived
// them the same way would only prove the derivation equals itself.

describe("resolveAttrName", () => {
  const CASES: [string, string][] = [
    // Aliases: the HTML name shares no shape with the React one.
    ["className", "class"],
    ["htmlFor", "for"],
    ["acceptCharset", "accept-charset"],
    ["httpEquiv", "http-equiv"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xmlLang", "xml:lang"],
    ["xmlBase", "xml:base"],
    ["xmlSpace", "xml:space"],
    // The whole xlink family, not just `href`.
    ["xlinkHref", "xlink:href"],
    ["xlinkActuate", "xlink:actuate"],
    ["xlinkArcrole", "xlink:arcrole"],
    ["xlinkRole", "xlink:role"],
    ["xlinkShow", "xlink:show"],
    ["xlinkTitle", "xlink:title"],
    ["xlinkType", "xlink:type"],
    // SVG presentation attributes: hyphenated in the spec.
    ["strokeWidth", "stroke-width"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["clipPath", "clip-path"],
    ["textAnchor", "text-anchor"],
    ["dominantBaseline", "dominant-baseline"],
    ["fontFamily", "font-family"],
    ["stopColor", "stop-color"],
    ["pointerEvents", "pointer-events"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["xHeight", "x-height"],
    ["vertOriginY", "vert-origin-y"],
    // SVG attributes that are camelCase in the spec: untouched.
    ["viewBox", "viewBox"],
    ["preserveAspectRatio", "preserveAspectRatio"],
    ["patternContentUnits", "patternContentUnits"],
    ["attributeName", "attributeName"],
    ["refX", "refX"],
    ["stdDeviation", "stdDeviation"],
    ["zoomAndPan", "zoomAndPan"],
    ["textLength", "textLength"],
    // Everything else lowercases — no entry needed, and none should exist.
    ["tabIndex", "tabindex"],
    ["readOnly", "readonly"],
    ["maxLength", "maxlength"],
    ["minLength", "minlength"],
    ["autoFocus", "autofocus"],
    ["autoComplete", "autocomplete"],
    ["encType", "enctype"],
    ["noValidate", "novalidate"],
    ["dateTime", "datetime"],
    ["srcSet", "srcset"],
    ["charSet", "charset"],
    ["crossOrigin", "crossorigin"],
    ["spellCheck", "spellcheck"],
    ["inputMode", "inputmode"],
    ["contentEditable", "contenteditable"],
    ["autoCapitalize", "autocapitalize"],
    // Already-HTML names pass straight through.
    ["class", "class"],
    ["id", "id"],
    ["data-turbo", "data-turbo"],
    ["aria-hidden", "aria-hidden"],
    ["stroke-width", "stroke-width"],
    ["nonce", "nonce"],
    ["property", "property"],
  ];

  for (const [input, expected] of CASES) {
    test(`${input} → ${expected}`, () => {
      expect(resolveAttrName(input)).toBe(expected);
    });
  }

  test("resolution is idempotent — a resolved name resolves to itself", () => {
    for (const [, expected] of CASES) {
      expect(resolveAttrName(expected)).toBe(expected);
    }
  });

  test("every resolved name is a legal attribute name", () => {
    for (const [input] of CASES) {
      expect(isValidAttrName(resolveAttrName(input))).toBe(true);
    }
  });
});

describe("resolveAttrName tables are consistent", () => {
  const { SVG_HYPHENATED, SVG_CASE_SENSITIVE } = ATTR_NAME_TABLES;

  test("no name is in both tables", () => {
    expect([...SVG_HYPHENATED.keys()].filter((k) => SVG_CASE_SENSITIVE.has(k))).toEqual([]);
  });

  // A table entry whose key already survives `toLowerCase()` unchanged would be
  // dead weight — the default branch would produce the same answer.
  test("every entry earns its place", () => {
    for (const [key, value] of SVG_HYPHENATED) {
      expect(value).not.toBe(key.toLowerCase());
      expect(value).toContain("-");
    }
    for (const key of SVG_CASE_SENSITIVE) {
      expect(key).not.toBe(key.toLowerCase());
    }
  });

  // The name the document carries must still be a name, whatever the table says.
  test("every table target is a legal attribute name", () => {
    for (const value of SVG_HYPHENATED.values()) expect(isValidAttrName(value)).toBe(true);
    for (const key of SVG_CASE_SENSITIVE) expect(isValidAttrName(key)).toBe(true);
  });
});

// ── Style objects, non-plain values ────────────────────────────────────────

describe("buildAttrs style — only an object literal is a bag of declarations", () => {
  test("a RawString is the developer's escape hatch, not a style bag", () => {
    // Read as a bag, `raw()`'s own `value` property became a declaration:
    // `style="value:color:red"`. `jsxAttr` never had the bug.
    expect(buildAttrs({ style: raw("color:red") })).toBe(' style="color:red"');
  });

  test("a class instance falls back to its string form instead of vanishing", () => {
    // Enumerating a Date's own keys yields nothing, so the attribute used to be
    // dropped in silence.
    const r = buildAttrs({ style: new Date(0) });
    expect(r).toContain(" style=");
  });

  test("an object with a null prototype is still a style bag", () => {
    const bag = Object.assign(Object.create(null) as object, { color: "red" });
    expect(buildAttrs({ style: bag })).toBe(' style="color:red"');
  });

  test("an array style is not a bag either", () => {
    expect(buildAttrs({ style: ["color:red"] })).toBe(' style="color:red"');
  });
});
