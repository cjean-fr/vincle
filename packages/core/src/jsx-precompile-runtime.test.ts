import { describe, expect, test } from "bun:test";

import { jsxTemplate, jsxAttr, jsxEscape } from "./jsx-precompile-runtime.js";
import { raw, RawString } from "./raw.js";

// Precompile runtime returns RawString | Promise<RawString> for async compat.
// All test values are sync — narrow for .value access.
const r = (x: RawString | Promise<RawString>): RawString => x as RawString;

describe("jsxTemplate", () => {
  test("static template", () => {
    expect(r(jsxTemplate`<div class="x">hello</div>`).value).toBe('<div class="x">hello</div>');
  });

  test("template with escaped content", () => {
    const name = "world";
    expect(r(jsxTemplate`<div>${jsxEscape(name)}</div>`).value).toBe("<div>world</div>");
  });

  test("template with escaped content needing escaping", () => {
    expect(r(jsxTemplate`<div>${jsxEscape("<script>")}</div>`).value).toBe(
      "<div>&lt;script&gt;</div>",
    );
  });

  test("template with dynamic attribute", () => {
    expect(r(jsxTemplate`<div${jsxAttr("class", "foo")}>text</div>`).value).toBe(
      '<div class="foo">text</div>',
    );
  });

  test("template with multiple dynamic parts", () => {
    expect(r(jsxTemplate`<a${jsxAttr("href", "/page")}>${jsxEscape("click")}</a>`).value).toBe(
      '<a href="/page">click</a>',
    );
  });

  test("nested jsxTemplate", () => {
    const inner = r(jsxTemplate`<span>${jsxEscape("inner")}</span>`);
    expect(r(jsxTemplate`<div>${jsxEscape(inner)}</div>`).value).toBe(
      "<div><span>inner</span></div>",
    );
  });

  test("boolean attribute true", () => {
    expect(r(jsxTemplate`<input${jsxAttr("disabled", true)}>`).value).toBe("<input disabled>");
  });

  test("boolean attribute false", () => {
    expect(r(jsxTemplate`<input${jsxAttr("disabled", false)}>`).value).toBe("<input>");
  });

  test("null/undefined attribute", () => {
    expect(r(jsxAttr("hidden", null)).value).toBe("");
    expect(r(jsxAttr("hidden", undefined)).value).toBe("");
  });

  test("className mapping", () => {
    expect(r(jsxTemplate`<div${jsxAttr("className", "box")}>text</div>`).value).toBe(
      '<div class="box">text</div>',
    );
  });

  test("style string attribute", () => {
    expect(r(jsxTemplate`<div${jsxAttr("style", "color:red")}>text</div>`).value).toBe(
      '<div style="color:red">text</div>',
    );
  });

  test("style object attribute", () => {
    expect(
      r(jsxTemplate`<div${jsxAttr("style", { color: "red", fontSize: "14px" })}>text</div>`).value,
    ).toBe('<div style="color:red;font-size:14px">text</div>');
  });

  test("class array", () => {
    expect(r(jsxTemplate`<div${jsxAttr("class", ["a", "b"])}>text</div>`).value).toBe(
      '<div class="a b">text</div>',
    );
  });

  test("RawString pass-through", () => {
    expect(r(jsxTemplate`<div>${jsxEscape(raw("<b>safe</b>"))}</div>`).value).toBe(
      "<div><b>safe</b></div>",
    );
  });

  test("number value", () => {
    expect(r(jsxTemplate`<span>${jsxEscape(42)}</span>`).value).toBe("<span>42</span>");
  });

  test("htmlFor mapping", () => {
    expect(r(jsxTemplate`<label${jsxAttr("htmlFor", "email")}>Email</label>`).value).toBe(
      '<label for="email">Email</label>',
    );
  });

  test("blocks javascript: href", () => {
    expect(r(jsxAttr("href", "javascript:alert(1)")).value).toContain("#blocked");
  });

  test("blocks javascript: href via jsxTemplate", () => {
    expect(r(jsxTemplate`<a${jsxAttr("href", "javascript:alert(1)")}>x</a>`).value).toBe(
      '<a href="#blocked">x</a>',
    );
  });

  test("allows http href", () => {
    expect(r(jsxAttr("href", "https://example.com")).value).toBe(' href="https://example.com"');
  });

  test("allows relative href", () => {
    expect(r(jsxAttr("href", "/page")).value).toBe(' href="/page"');
    expect(r(jsxAttr("href", "#section")).value).toBe(' href="#section"');
    expect(r(jsxAttr("href", "?query")).value).toBe(' href="?query"');
  });

  test("allows mailto href", () => {
    expect(r(jsxAttr("href", "mailto:test@example.com")).value).toBe(
      ' href="mailto:test@example.com"',
    );
  });

  test("blocks vbscript: href", () => {
    expect(r(jsxAttr("href", "vbscript:msgbox(1)")).value).toContain("#blocked");
  });

  test("safe src is unaffected", () => {
    expect(r(jsxAttr("src", "/image.png")).value).toBe(' src="/image.png"');
  });

  test("blocks javascript: src", () => {
    expect(r(jsxAttr("src", "javascript:alert(1)")).value).toContain("#blocked");
  });

  test("non-URL attribute is not checked", () => {
    expect(r(jsxAttr("id", "javascript:is-ok-here")).value).toBe(' id="javascript:is-ok-here"');
  });

  test("allows javascript: in srcset (no JS execution vector)", () => {
    expect(r(jsxAttr("srcSet", "javascript:alert(1) 1x")).value).toBe(
      ' srcset="javascript:alert(1) 1x"',
    );
  });

  test("safe srcset is unaffected", () => {
    expect(r(jsxAttr("srcSet", "/img.png 1x, /img2.png 2x")).value).toContain("/img.png");
  });
});
