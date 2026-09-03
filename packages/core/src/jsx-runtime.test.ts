import { describe, expect, test } from "bun:test";

import { jsx, jsxAttr, Fragment, VNode } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { RawString } from "./types.js";

// The hybrid model folds fully-static subtrees to a RawString at jsx() time;
// anything dynamic (component, dSIH, promise or function child) stays a VNode for
// the tree-walk render. These tests pin that fold contract via the return type of
// jsx() plus the rendered markup.
//
// A style object and a class array are *not* dynamic, though they used to leave
// the fold as if they were: `buildAttrs` serializes both, and the fold calls
// `buildAttrs`. See `serialize.ts`.

describe("static subtree fold", () => {
  test("simple static div with text child folds to RawString", async () => {
    const node = jsx("div", { class: "foo", children: "hello" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe('<div class="foo">hello</div>');
  });

  test("static div with number child folds", async () => {
    const node = jsx("span", { children: 42 });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe("<span>42</span>");
  });

  test("void element folds", async () => {
    const br = jsx("br", {});
    expect(br).toBeInstanceOf(RawString);
    expect(await renderToString(br)).toBe("<br>");
  });

  test("nested static elements fold", async () => {
    const inner = jsx("span", { class: "inner", children: "text" });
    const outer = jsx("div", { class: "outer", children: inner });
    expect(inner).toBeInstanceOf(RawString);
    expect(outer).toBeInstanceOf(RawString);
    expect(await renderToString(outer)).toBe(
      '<div class="outer"><span class="inner">text</span></div>',
    );
  });

  test("static element with array children folds", async () => {
    const items = [jsx("li", { key: "1", children: "a" }), jsx("li", { key: "2", children: "b" })];
    const ul = jsx("ul", { children: items });
    expect(ul).toBeInstanceOf(RawString);
    expect(await renderToString(ul)).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  test("component is NOT folded (stays a VNode)", () => {
    const Comp = () => jsx("div", { children: "hello" });
    const node = jsx(Comp, {});
    expect(node).toBeInstanceOf(VNode);
  });

  test("object style folds — buildAttrs handles it on both paths", async () => {
    const node = jsx("div", { style: { color: "red" }, children: "x" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe('<div style="color:red">x</div>');
  });

  test("class array folds — buildAttrs handles it on both paths", async () => {
    const node = jsx("div", { class: ["foo", "bar"], children: "x" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe('<div class="foo bar">x</div>');
  });

  // The fold and the tree walk must not merely both work — they must agree.
  test("folded attributes are byte-identical to the tree-walk's", async () => {
    const props = { style: { backgroundColor: "red", "--x": 1 }, class: ["a", "", "b"], id: "i" };
    const folded = jsx("p", { ...props, children: "t" });
    const walked = new VNode("p", { ...props }, "t");
    expect(folded).toBeInstanceOf(RawString);
    expect(await renderToString(folded)).toBe(await renderToString(walked));
  });

  test("dangerouslySetInnerHTML is NOT folded", () => {
    const node = jsx("div", { dangerouslySetInnerHTML: { __html: "<p>hello</p>" } });
    expect(node).toBeInstanceOf(VNode);
  });

  test("rawtext tag still folds", async () => {
    const node = jsx("script", { children: "const x = 1;" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe("<script>const x = 1;</script>");
  });

  test("promise child is NOT folded", () => {
    const node = jsx("div", { children: Promise.resolve("hello") });
    expect(node).toBeInstanceOf(VNode);
  });

  test("function child is NOT folded", () => {
    const node = jsx("div", { children: () => jsx("span", {}) });
    expect(node).toBeInstanceOf(VNode);
  });

  test("fragment with array children renders correctly", async () => {
    const frag = jsx(Fragment, {
      children: [jsx("div", { children: "a" }), jsx("span", { children: "b" })],
    });
    const wrapper = jsx("div", { children: frag });
    expect(await renderToString(wrapper)).toBe("<div><div>a</div><span>b</span></div>");
  });

  test("escaping still works", async () => {
    const node = jsx("div", { children: "<script>alert(1)</script>" });
    expect(await renderToString(node)).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });

  test("attribute escaping", async () => {
    const node = jsx("div", { title: 'hello "world" & friends' });
    expect(await renderToString(node)).toBe(
      '<div title="hello &quot;world&quot; &amp; friends"></div>',
    );
  });

  test("fragment (function tag) is NOT folded", () => {
    const node = jsx(Fragment, { children: [jsx("div", {})] });
    expect(node).toBeInstanceOf(VNode);
  });
});

describe("jsxAttr", () => {
  test("string value", () => {
    const r = jsxAttr("class", "foo") as RawString;
    expect(r).toBeInstanceOf(RawString);
    expect(r.value).toBe('class="foo"');
  });

  test("number value", () => {
    const r = jsxAttr("tabindex", 42) as RawString;
    expect(r.value).toBe('tabindex="42"');
  });

  test("boolean true for boolean attribute", () => {
    const r = jsxAttr("disabled", true) as RawString;
    expect(r.value).toBe("disabled");
  });

  test("boolean false for boolean attribute", () => {
    const r = jsxAttr("disabled", false) as RawString;
    expect(r.value).toBe("");
  });

  // The fragment is bare — the separating space is the transform's, and
  // `jsxTemplate` is what takes it back when these cases return "".
  test("null/undefined are skipped", () => {
    expect((jsxAttr("hidden", null) as RawString).value).toBe("");
    expect((jsxAttr("hidden", undefined) as RawString).value).toBe("");
  });

  test("children/key/ref/dangerouslySetInnerHTML are dropped", () => {
    expect((jsxAttr("children", "x") as RawString).value).toBe("");
    expect((jsxAttr("key", "k1") as RawString).value).toBe("");
    expect((jsxAttr("ref", "r1") as RawString).value).toBe("");
    expect((jsxAttr("dangerouslySetInnerHTML", { __html: "" }) as RawString).value).toBe("");
  });

  test("className remaps to class", () => {
    const r = jsxAttr("className", "box") as RawString;
    expect(r.value).toBe('class="box"');
  });

  test("style object serializes", () => {
    const r = jsxAttr("style", { color: "red", fontSize: "14px" }) as RawString;
    expect(r.value).toBe('style="color:red;font-size:14px"');
  });

  test("class array joins", () => {
    const r = jsxAttr("class", ["a", "b"]) as RawString;
    expect(r.value).toBe('class="a b"');
  });

  test("URL safety blocks javascript:", () => {
    const r = jsxAttr("href", "javascript:alert(1)") as RawString;
    expect(r.value).toContain("#blocked");
  });

  test("safe URL passes through", () => {
    const r = jsxAttr("href", "/page") as RawString;
    expect(r.value).toBe('href="/page"');
  });

  test("non-boolean attribute with boolean true renders as string", () => {
    const r = jsxAttr("data-active", true) as RawString;
    expect(r.value).toBe('data-active="true"');
  });

  test("attribute escaping", () => {
    const r = jsxAttr("title", 'hello "world"') as RawString;
    expect(r.value).toBe('title="hello &quot;world&quot;"');
  });
});
