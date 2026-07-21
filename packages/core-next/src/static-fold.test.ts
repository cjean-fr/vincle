import { describe, expect, test } from "bun:test";
import { jsx, Fragment, VNode } from "./jsx-runtime.js";
import { renderToString } from "./create-element.js";
import { RawString } from "./raw.js";

// The hybrid model folds fully-static subtrees to a RawString at jsx() time;
// anything dynamic (component, style object, class array, dSIH, promise or
// function child) stays a VNode for the tree-walk render. These tests pin that
// fold contract via the return type of jsx() plus the rendered markup.

describe("static subtree fold", () => {
  test("simple static div with text child folds to RawString", () => {
    const node = jsx("div", { class: "foo", children: "hello" });
    expect(node).toBeInstanceOf(RawString);
    expect(renderToString(node)).toBe('<div class="foo">hello</div>');
  });

  test("static div with number child folds", () => {
    const node = jsx("span", { children: 42 });
    expect(node).toBeInstanceOf(RawString);
    expect(renderToString(node)).toBe("<span>42</span>");
  });

  test("void element folds", () => {
    const br = jsx("br", {});
    expect(br).toBeInstanceOf(RawString);
    expect(renderToString(br)).toBe("<br>");
  });

  test("nested static elements fold", () => {
    const inner = jsx("span", { class: "inner", children: "text" });
    const outer = jsx("div", { class: "outer", children: inner });
    expect(inner).toBeInstanceOf(RawString);
    expect(outer).toBeInstanceOf(RawString);
    expect(renderToString(outer)).toBe('<div class="outer"><span class="inner">text</span></div>');
  });

  test("static element with array children folds", () => {
    const items = [
      jsx("li", { key: "1", children: "a" }),
      jsx("li", { key: "2", children: "b" }),
    ];
    const ul = jsx("ul", { children: items });
    expect(ul).toBeInstanceOf(RawString);
    expect(renderToString(ul)).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  test("component is NOT folded (stays a VNode)", () => {
    const Comp = () => jsx("div", { children: "hello" });
    const node = jsx(Comp, {});
    expect(node).toBeInstanceOf(VNode);
  });

  test("object style is NOT folded", () => {
    const node = jsx("div", { style: { color: "red" } });
    expect(node).toBeInstanceOf(VNode);
  });

  test("class array is NOT folded", () => {
    const node = jsx("div", { class: ["foo", "bar"] });
    expect(node).toBeInstanceOf(VNode);
  });

  test("dangerouslySetInnerHTML is NOT folded", () => {
    const node = jsx("div", { dangerouslySetInnerHTML: { __html: "<p>hello</p>" } });
    expect(node).toBeInstanceOf(VNode);
  });

  test("rawtext tag still folds", () => {
    const node = jsx("script", { children: "const x = 1;" });
    expect(node).toBeInstanceOf(RawString);
    expect(renderToString(node)).toBe("<script>const x = 1;</script>");
  });

  test("promise child is NOT folded", () => {
    const node = jsx("div", { children: Promise.resolve("hello") });
    expect(node).toBeInstanceOf(VNode);
  });

  test("function child is NOT folded", () => {
    const node = jsx("div", { children: () => jsx("span", {}) });
    expect(node).toBeInstanceOf(VNode);
  });

  test("fragment with array children renders correctly", () => {
    const frag = jsx(Fragment as any, {
      children: [jsx("div", { children: "a" }), jsx("span", { children: "b" })],
    });
    const wrapper = jsx("div", { children: frag });
    expect(renderToString(wrapper)).toBe("<div><div>a</div><span>b</span></div>");
  });

  test("escaping still works", () => {
    const node = jsx("div", { children: "<script>alert(1)</script>" });
    expect(renderToString(node)).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });

  test("attribute escaping", () => {
    const node = jsx("div", { title: 'hello "world" & friends' });
    expect(renderToString(node)).toBe('<div title="hello &quot;world&quot; &amp; friends"></div>');
  });

  test("fragment (function tag) is NOT folded", () => {
    const node = jsx(Fragment as any, { children: [jsx("div", {})] });
    expect(node).toBeInstanceOf(VNode);
  });
});
