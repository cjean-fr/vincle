import { describe, expect, test } from "bun:test";

import { buildAttrs } from "./attrs.js";
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
    expect(buildAttrs({ style: { backgroundColor: "red" } })).toBe(
      ' style="background-color:red"',
    );
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
