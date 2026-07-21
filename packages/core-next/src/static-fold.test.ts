import { describe, expect, test } from "bun:test";
import { jsx, Fragment, VNode } from "./jsx-runtime.js";
import { renderToString } from "./create-element.js";
import { raw } from "./raw.js";

describe("static subtree detection", () => {
  test("simple static div with text child", () => {
    const vnode = jsx("div", { class: "foo", children: "hello" });
    expect(vnode._isStatic).toBe(true);
    expect(renderToString(vnode)).toBe('<div class="foo">hello</div>');
  });

  test("static div with number child", () => {
    const vnode = jsx("span", { children: 42 });
    expect(vnode._isStatic).toBe(true);
    expect(renderToString(vnode)).toBe("<span>42</span>");
  });

  test("void element is static", () => {
    const br = jsx("br", {});
    expect(br._isStatic).toBe(true);
    expect(renderToString(br)).toBe("<br>");
  });

  test("nested static elements", () => {
    const inner = jsx("span", { class: "inner", children: "text" });
    const outer = jsx("div", { class: "outer", children: inner });
    expect(inner._isStatic).toBe(true);
    expect(outer._isStatic).toBe(true);
    expect(renderToString(outer)).toBe('<div class="outer"><span class="inner">text</span></div>');
  });

  test("static element with array children", () => {
    const items = [
      jsx("li", { key: "1", children: "a" }),
      jsx("li", { key: "2", children: "b" }),
    ];
    const ul = jsx("ul", { children: items });
    expect(ul._isStatic).toBe(true);
    expect(renderToString(ul)).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  test("component vnode is NOT marked static", () => {
    const Comp = () => jsx("div", { children: "hello" });
    const vnode = jsx(Comp, {});
    expect(vnode._isStatic).toBeUndefined();
  });

  test("vnode with object style is NOT static", () => {
    const vnode = jsx("div", { style: { color: "red" } });
    expect(vnode._isStatic).toBe(false);
  });

  test("vnode with class array is NOT static", () => {
    const vnode = jsx("div", { class: ["foo", "bar"] });
    expect(vnode._isStatic).toBe(false);
  });

  test("vnode with dangerouslySetInnerHTML is NOT static", () => {
    const vnode = jsx("div", { dangerouslySetInnerHTML: { __html: "<p>hello</p>" } });
    expect(vnode._isStatic).toBe(false);
  });

  test("rawtext tag is still static", () => {
    const vnode = jsx("script", { children: "const x = 1;" });
    expect(vnode._isStatic).toBe(true);
    expect(renderToString(vnode)).toBe("<script>const x = 1;</script>");
  });

  test("non-static due to promise child", () => {
    const vnode = jsx("div", { children: Promise.resolve("hello") });
    expect(vnode._isStatic).toBe(false);
  });

  test("non-static due to function child", () => {
    const vnode = jsx("div", { children: () => jsx("span", {}) });
    expect(vnode._isStatic).toBe(false);
  });

  test("fragment with children renders correctly", () => {
    const frag = jsx(Fragment as any, { children: [jsx("div", { children: "a" }), jsx("span", { children: "b" })] });
    const wrapper = jsx("div", { children: frag });
    expect(renderToString(wrapper)).toBe("<div><div>a</div><span>b</span></div>");
  });

  test("escaping still works", () => {
    const vnode = jsx("div", { children: "<script>alert(1)</script>" });
    expect(renderToString(vnode)).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });

  test("attribute escaping", () => {
    const vnode = jsx("div", { title: 'hello "world" & friends' });
    expect(renderToString(vnode)).toBe('<div title="hello &quot;world&quot; &amp; friends"></div>');
  });

  test("fragment vnode tag (function) is not static", () => {
    const vnode = jsx(Fragment as any, { children: [jsx("div", {})] });
    expect(vnode._isStatic).toBeUndefined();
  });
});
