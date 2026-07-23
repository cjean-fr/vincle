import { describe, expect, test } from "bun:test";
import { buildAttrs } from "./attrs.js";

describe("buildAttrs — escaping & normalization (no URL-scheme rewriting)", () => {
  test("emits URL schemes verbatim (escaped only) — vincle does not block schemes", () => {
    // Security model: escaping prevents attribute breakout; scheme policy is the
    // app's job (CSP + sanitizing untrusted URLs). No silent #blocked rewrite.
    expect(buildAttrs({ href: "javascript:alert(1)" })).toBe(' href="javascript:alert(1)"');
    expect(buildAttrs({ src: "javascript:alert(1)" })).toBe(' src="javascript:alert(1)"');
  });

  test("escapes attribute-breakout characters", () => {
    expect(buildAttrs({ title: 'a "b" & <c>' })).toBe(' title="a &quot;b&quot; &amp; &lt;c>"');
  });

  test("allows http/relative href verbatim", () => {
    expect(buildAttrs({ href: "https://example.com" })).toBe(' href="https://example.com"');
    expect(buildAttrs({ href: "/page" })).toBe(' href="/page"');
    expect(buildAttrs({ href: "#section" })).toBe(' href="#section"');
  });

  test("resolves React attribute names", () => {
    expect(buildAttrs({ className: "foo" })).toBe(' class="foo"');
    expect(buildAttrs({ htmlFor: "email" })).toBe(' for="email"');
  });

  test("HTML name wins when React alias also present", () => {
    expect(buildAttrs({ className: "react", class: "html" })).toBe(' class="html"');
  });

  test("boolean attributes", () => {
    expect(buildAttrs({ disabled: true })).toBe(" disabled");
    expect(buildAttrs({ disabled: false })).toBe("");
    // non-boolean attr with boolean value → stringified
    expect(buildAttrs({ "aria-hidden": false })).toBe(' aria-hidden="false"');
  });

  test("style object → string", () => {
    expect(buildAttrs({ style: { color: "red", fontSize: "14px" } })).toBe(
      ' style="color:red;font-size:14px"',
    );
  });

  test("class array → joined string", () => {
    expect(buildAttrs({ class: ["a", "", "b"] })).toBe(' class="a b"');
  });

  test("event handler as function is dropped (client-side intent)", () => {
    expect(buildAttrs({ onClick: () => {} })).toBe("");
  });

  test("event handler as string is emitted (deliberate inline handler)", () => {
    expect(buildAttrs({ onclick: "doThing()" })).toBe(' onclick="doThing()"');
  });

  test("non-event function value throws (programmer error)", () => {
    expect(() => buildAttrs({ title: () => "x" })).toThrow(/function/);
  });

  test("null/undefined are dropped", () => {
    expect(buildAttrs({ id: null, title: undefined })).toBe("");
  });
});
