import { describe, expect, test } from "bun:test";
import { buildAttrs } from "./attrs.js";
import { raw } from "./raw.js";

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
});
