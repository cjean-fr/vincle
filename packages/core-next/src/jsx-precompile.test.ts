import { describe, expect, test } from "bun:test";
import { jsxTemplate, jsxAttr, jsxEscape } from "./jsx-runtime.js";
import { raw } from "./raw.js";

describe("jsxTemplate", () => {
  test("static template", () => {
    const r = jsxTemplate`<div class="x">hello</div>`;
    expect(r.value).toBe('<div class="x">hello</div>');
  });

  test("template with escaped content", () => {
    const name = "world";
    const r = jsxTemplate`<div>${jsxEscape(name)}</div>`;
    expect(r.value).toBe("<div>world</div>");
  });

  test("template with escaped content needing escaping", () => {
    const r = jsxTemplate`<div>${jsxEscape("<script>")}</div>`;
    expect(r.value).toBe("<div>&lt;script&gt;</div>");
  });

  test("template with dynamic attribute", () => {
    const r = jsxTemplate`<div${jsxAttr("class", "foo")}>text</div>`;
    expect(r.value).toBe('<div class="foo">text</div>');
  });

  test("template with multiple dynamic parts", () => {
    const r = jsxTemplate`<a${jsxAttr("href", "/page")}>${jsxEscape("click")}</a>`;
    expect(r.value).toBe('<a href="/page">click</a>');
  });

  test("nested jsxTemplate", () => {
    const inner = jsxTemplate`<span>${jsxEscape("inner")}</span>`;
    const r = jsxTemplate`<div>${jsxEscape(inner)}</div>`;
    expect(r.value).toBe("<div><span>inner</span></div>");
  });

  test("boolean attribute true", () => {
    const r = jsxTemplate`<input${jsxAttr("disabled", true)}>`;
    expect(r.value).toBe("<input disabled>");
  });

  test("boolean attribute false", () => {
    const r = jsxTemplate`<input${jsxAttr("disabled", false)}>`;
    expect(r.value).toBe("<input>");
  });

  test("null/undefined attribute", () => {
    expect((jsxAttr("hidden", null) as any).value).toBe("");
    expect((jsxAttr("hidden", undefined) as any).value).toBe("");
  });

  test("className mapping", () => {
    const r = jsxTemplate`<div${jsxAttr("className", "box")}>text</div>`;
    expect(r.value).toBe('<div class="box">text</div>');
  });

  test("style string attribute", () => {
    const r = jsxTemplate`<div${jsxAttr("style", "color:red")}>text</div>`;
    expect(r.value).toBe('<div style="color:red">text</div>');
  });

  test("style object attribute", () => {
    const r = jsxTemplate`<div${jsxAttr("style", { color: "red", fontSize: "14px" })}>text</div>`;
    expect(r.value).toBe('<div style="color:red;font-size:14px">text</div>');
  });

  test("class array", () => {
    const r = jsxTemplate`<div${jsxAttr("class", ["a", "b"])}>text</div>`;
    expect(r.value).toBe('<div class="a b">text</div>');
  });

  test("RawString pass-through", () => {
    const r = jsxTemplate`<div>${jsxEscape(raw("<b>safe</b>"))}</div>`;
    expect(r.value).toBe("<div><b>safe</b></div>");
  });

  test("number value", () => {
    const r = jsxTemplate`<span>${jsxEscape(42)}</span>`;
    expect(r.value).toBe("<span>42</span>");
  });

  test("htmlFor mapping", () => {
    const r = jsxTemplate`<label${jsxAttr("htmlFor", "email")}>Email</label>`;
    expect(r.value).toBe('<label for="email">Email</label>');
  });

  test("blocks javascript: href", () => {
    const r = jsxAttr("href", "javascript:alert(1)");
    expect(r.value).toContain("#blocked");
  });

  test("blocks javascript: href via jsxTemplate", () => {
    const r = jsxTemplate`<a${jsxAttr("href", "javascript:alert(1)")}>x</a>`;
    expect(r.value).toBe('<a href="#blocked">x</a>');
  });

  test("allows http href", () => {
    const r = jsxAttr("href", "https://example.com");
    expect(r.value).toBe(' href="https://example.com"');
  });

  test("allows relative href", () => {
    expect(jsxAttr("href", "/page").value).toBe(' href="/page"');
    expect(jsxAttr("href", "#section").value).toBe(' href="#section"');
    expect(jsxAttr("href", "?query").value).toBe(' href="?query"');
  });

  test("allows mailto href", () => {
    const r = jsxAttr("href", "mailto:test@example.com");
    expect(r.value).toBe(' href="mailto:test@example.com"');
  });

  test("blocks vbscript: href", () => {
    const r = jsxAttr("href", "vbscript:msgbox(1)");
    expect(r.value).toContain("#blocked");
  });

  test("safe src is unaffected", () => {
    const r = jsxAttr("src", "/image.png");
    expect(r.value).toBe(' src="/image.png"');
  });

  test("blocks javascript: src", () => {
    const r = jsxAttr("src", "javascript:alert(1)");
    expect(r.value).toContain("#blocked");
  });

  test("non-URL attribute is not checked", () => {
    const r = jsxAttr("id", "javascript:is-ok-here");
    expect(r.value).toBe(' id="javascript:is-ok-here"');
  });

  test("blocks javascript: in srcset", () => {
    const r = jsxAttr("srcSet", "javascript:alert(1) 1x");
    expect(r.value).toContain("#blocked");
  });

  test("safe srcset is unaffected", () => {
    const r = jsxAttr("srcSet", "/img.png 1x, /img2.png 2x");
    expect(r.value).toContain("/img.png");
  });
});
