import { describe, expect, test } from "bun:test";

import { jsxTemplate, jsxAttr, jsxEscape } from "./jsx-precompile-runtime.js";
import { raw, RawString } from "./types.js";

describe("jsxTemplate", () => {
  test("static template", () => {
    expect((jsxTemplate`<div class="x">hello</div>` as RawString).value).toBe(
      '<div class="x">hello</div>',
    );
  });

  test("template with escaped content", () => {
    const name = "world";
    expect((jsxTemplate`<div>${jsxEscape(name)}</div>` as RawString).value).toBe(
      "<div>world</div>",
    );
  });

  test("template with escaped content needing escaping", () => {
    expect((jsxTemplate`<div>${jsxEscape("<script>")}</div>` as RawString).value).toBe(
      "<div>&lt;script&gt;</div>",
    );
  });

  test("template with dynamic attribute", () => {
    expect((jsxTemplate`<div ${jsxAttr("class", "foo")}>text</div>` as RawString).value).toBe(
      '<div class="foo">text</div>',
    );
  });

  test("template with multiple dynamic parts", () => {
    expect(
      (jsxTemplate`<a ${jsxAttr("href", "/page")}>${jsxEscape("click")}</a>` as RawString).value,
    ).toBe('<a href="/page">click</a>');
  });

  test("nested jsxTemplate", () => {
    const inner = jsxTemplate`<span>${jsxEscape("inner")}</span>` as RawString;
    expect((jsxTemplate`<div>${jsxEscape(inner)}</div>` as RawString).value).toBe(
      "<div><span>inner</span></div>",
    );
  });

  test("boolean attribute true", () => {
    expect((jsxTemplate`<input ${jsxAttr("disabled", true)}>` as RawString).value).toBe(
      "<input disabled>",
    );
  });

  test("boolean attribute false", () => {
    expect((jsxTemplate`<input ${jsxAttr("disabled", false)}>` as RawString).value).toBe(
      "<input >",
    );
  });

  test("null/undefined attribute", () => {
    expect((jsxAttr("hidden", null) as RawString).value).toBe("");
    expect((jsxAttr("hidden", undefined) as RawString).value).toBe("");
  });

  test("className mapping", () => {
    expect((jsxTemplate`<div ${jsxAttr("className", "box")}>text</div>` as RawString).value).toBe(
      '<div class="box">text</div>',
    );
  });

  test("style string attribute", () => {
    expect((jsxTemplate`<div ${jsxAttr("style", "color:red")}>text</div>` as RawString).value).toBe(
      '<div style="color:red">text</div>',
    );
  });

  test("style object attribute", () => {
    expect(
      (
        jsxTemplate`<div ${jsxAttr("style", { color: "red", fontSize: "14px" })}>text</div>` as RawString
      ).value,
    ).toBe('<div style="color:red;font-size:14px">text</div>');
  });

  test("class array", () => {
    expect((jsxTemplate`<div ${jsxAttr("class", ["a", "b"])}>text</div>` as RawString).value).toBe(
      '<div class="a b">text</div>',
    );
  });

  test("RawString pass-through", () => {
    expect((jsxTemplate`<div>${jsxEscape(raw("<b>safe</b>"))}</div>` as RawString).value).toBe(
      "<div><b>safe</b></div>",
    );
  });

  test("number value", () => {
    expect((jsxTemplate`<span>${jsxEscape(42)}</span>` as RawString).value).toBe("<span>42</span>");
  });

  test("htmlFor mapping", () => {
    expect(
      (jsxTemplate`<label ${jsxAttr("htmlFor", "email")}>Email</label>` as RawString).value,
    ).toBe('<label for="email">Email</label>');
  });

  test("blocks javascript: href", () => {
    expect((jsxAttr("href", "javascript:alert(1)") as RawString).value).toContain("#blocked");
  });

  test("blocks javascript: href via jsxTemplate", () => {
    expect(
      (jsxTemplate`<a ${jsxAttr("href", "javascript:alert(1)")}>x</a>` as RawString).value,
    ).toBe('<a href="#blocked">x</a>');
  });

  test("allows http href", () => {
    expect((jsxAttr("href", "https://example.com") as RawString).value).toBe(
      'href="https://example.com"',
    );
  });

  test("allows relative href", () => {
    expect((jsxAttr("href", "/page") as RawString).value).toBe('href="/page"');
    expect((jsxAttr("href", "#section") as RawString).value).toBe('href="#section"');
    expect((jsxAttr("href", "?query") as RawString).value).toBe('href="?query"');
  });

  test("allows mailto href", () => {
    expect((jsxAttr("href", "mailto:test@example.com") as RawString).value).toBe(
      'href="mailto:test@example.com"',
    );
  });

  test("blocks vbscript: href", () => {
    expect((jsxAttr("href", "vbscript:msgbox(1)") as RawString).value).toContain("#blocked");
  });

  test("safe src is unaffected", () => {
    expect((jsxAttr("src", "/image.png") as RawString).value).toBe('src="/image.png"');
  });

  test("blocks javascript: src", () => {
    expect((jsxAttr("src", "javascript:alert(1)") as RawString).value).toContain("#blocked");
  });

  test("non-URL attribute is not checked", () => {
    expect((jsxAttr("id", "javascript:is-ok-here") as RawString).value).toBe(
      'id="javascript:is-ok-here"',
    );
  });

  test("allows javascript: in srcset (no JS execution vector)", () => {
    expect((jsxAttr("srcSet", "javascript:alert(1) 1x") as RawString).value).toBe(
      'srcset="javascript:alert(1) 1x"',
    );
  });

  test("safe srcset is unaffected", () => {
    expect((jsxAttr("srcSet", "/img.png 1x, /img2.png 2x") as RawString).value).toContain(
      "/img.png",
    );
  });
});
