import { describe, expect, test } from "bun:test";
import {
  jsxTemplate as _jsxTemplate,
  jsxAttr as _jsxAttr,
  jsxEscape as _jsxEscape,
} from "./jsx-runtime.js";
import { raw, RawString } from "./raw.js";

// Every input in this suite is synchronous, so the helpers always return a
// RawString (never a Promise). Narrow the signatures here so `.value` reads
// type-check without a cast on every assertion.
const jsxTemplate = _jsxTemplate as (t: ArrayLike<string>, ...v: unknown[]) => RawString;
const jsxAttr = _jsxAttr as (name: string, value: unknown) => RawString;
const jsxEscape = _jsxEscape as (value: unknown) => RawString;

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

  // Security model: escape-only, no URL-scheme rewriting (parity with the
  // runtime buildAttrs path). Schemes pass through verbatim; the app enforces
  // scheme policy via CSP / sanitizing untrusted URLs.
  test("URL schemes pass through verbatim (escaped only)", () => {
    expect(jsxAttr("href", "javascript:alert(1)").value).toBe(' href="javascript:alert(1)"');
    expect(jsxAttr("src", "javascript:alert(1)").value).toBe(' src="javascript:alert(1)"');
    expect(jsxAttr("href", "vbscript:msgbox(1)").value).toBe(' href="vbscript:msgbox(1)"');
  });

  test("URL scheme verbatim via jsxTemplate", () => {
    const r = jsxTemplate`<a${jsxAttr("href", "javascript:alert(1)")}>x</a>`;
    expect(r.value).toBe('<a href="javascript:alert(1)">x</a>');
  });

  test("http / relative / mailto hrefs", () => {
    expect(jsxAttr("href", "https://example.com").value).toBe(' href="https://example.com"');
    expect(jsxAttr("href", "/page").value).toBe(' href="/page"');
    expect(jsxAttr("href", "#section").value).toBe(' href="#section"');
    expect(jsxAttr("href", "?query").value).toBe(' href="?query"');
    expect(jsxAttr("href", "mailto:test@example.com").value).toBe(' href="mailto:test@example.com"');
  });

  test("src and srcset pass through", () => {
    expect(jsxAttr("src", "/image.png").value).toBe(' src="/image.png"');
    expect(jsxAttr("srcSet", "/img.png 1x, /img2.png 2x").value).toBe(
      ' srcset="/img.png 1x, /img2.png 2x"',
    );
  });

  test("event handler as string is emitted, function is dropped", () => {
    expect(jsxAttr("onclick", "doThing()").value).toBe(' onclick="doThing()"');
    expect(jsxAttr("onClick", () => {}).value).toBe("");
  });
});
