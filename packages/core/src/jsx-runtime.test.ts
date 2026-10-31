import { describe, expect, test } from "bun:test";

import { jsx, jsxAttr, createElement, Fragment } from "./jsx-runtime.js";
import { createContext, useContext } from "./provider.js";
import { renderToString } from "./render.js";
import { VNode, RawString } from "./types.js";

// The hybrid model serializes fully-static subtrees to a RawString at jsx() time;
// anything dynamic (component, dSIH, promise or function child) stays a VNode for
// the tree-walk render. These tests pin that contract via the return type of
// jsx() plus the rendered markup.
//
// A style object and a class array are *not* dynamic, though they used to leave
// the static path as if they were: `buildAttrs` serializes both, and the static path calls
// `buildAttrs`. See `serialize.ts`.

describe("static subtree serialization", () => {
  test("simple static div with text child serializes to RawString", async () => {
    const node = jsx("div", { class: "foo", children: "hello" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe('<div class="foo">hello</div>');
  });

  test("static div with number child serializes", async () => {
    const node = jsx("span", { children: 42 });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe("<span>42</span>");
  });

  test("void element serializes", async () => {
    const br = jsx("br", {});
    expect(br).toBeInstanceOf(RawString);
    expect(await renderToString(br)).toBe("<br>");
  });

  test("nested static elements serialize", async () => {
    const inner = jsx("span", { class: "inner", children: "text" });
    const outer = jsx("div", { class: "outer", children: inner });
    expect(inner).toBeInstanceOf(RawString);
    expect(outer).toBeInstanceOf(RawString);
    expect(await renderToString(outer)).toBe(
      '<div class="outer"><span class="inner">text</span></div>',
    );
  });

  test("static element with array children serializes", async () => {
    const items = [jsx("li", { key: "1", children: "a" }), jsx("li", { key: "2", children: "b" })];
    const ul = jsx("ul", { children: items });
    expect(ul).toBeInstanceOf(RawString);
    expect(await renderToString(ul)).toBe("<ul><li>a</li><li>b</li></ul>");
  });

  test("component is NOT serialized (stays a VNode)", () => {
    const Comp = () => jsx("div", { children: "hello" });
    const node = jsx(Comp, {});
    expect(node).toBeInstanceOf(VNode);
  });

  test("object style serializes: buildAttrs handles it on both paths", async () => {
    const node = jsx("div", { style: { color: "red" }, children: "x" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe('<div style="color:red">x</div>');
  });

  test("class array serializes: buildAttrs handles it on both paths", async () => {
    const node = jsx("div", { class: ["foo", "bar"], children: "x" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe('<div class="foo bar">x</div>');
  });

  // The static path and the tree walk must not merely both work: they must agree.
  test("serialized attributes are byte-identical to the tree-walk's", async () => {
    const props = { style: { backgroundColor: "red", "--x": 1 }, class: ["a", "", "b"], id: "i" };
    const serialized = jsx("p", { ...props, children: "t" });
    const walked = new VNode("p", { ...props }, "t");
    expect(serialized).toBeInstanceOf(RawString);
    expect(await renderToString(serialized)).toBe(await renderToString(walked));
  });

  test("dangerouslySetInnerHTML is NOT serialized", () => {
    const node = jsx("div", { dangerouslySetInnerHTML: { __html: "<p>hello</p>" } });
    expect(node).toBeInstanceOf(VNode);
  });

  test("rawtext tag still serializes", async () => {
    const node = jsx("script", { children: "const x = 1;" });
    expect(node).toBeInstanceOf(RawString);
    expect(await renderToString(node)).toBe("<script>const x = 1;</script>");
  });

  test("promise child is NOT serialized", () => {
    const node = jsx("div", { children: Promise.resolve("hello") });
    expect(node).toBeInstanceOf(VNode);
  });

  test("function child is NOT serialized", () => {
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

  test("fragment (function tag) is NOT serialized", () => {
    const node = jsx(Fragment, { children: [jsx("div", {})] });
    expect(node).toBeInstanceOf(VNode);
  });
});

describe("function components own dangerouslySetInnerHTML", () => {
  // Function tags are components: `dangerouslySetInnerHTML` on them is a plain
  // business prop the component itself interprets. jsx() must not read it,
  // replace children with it, validate its shape, or fire a getter in it.

  test("object42 reaches the component unchanged, no throw at construction", async () => {
    const Comp = ({ dangerouslySetInnerHTML }: { dangerouslySetInnerHTML?: unknown }) =>
      jsx("pre", {
        children: `42:${typeof dangerouslySetInnerHTML === "object" ? "obj" : String(dangerouslySetInnerHTML)}`,
      });
    const node = jsx(Comp, { dangerouslySetInnerHTML: { __html: 42 } });
    expect(await renderToString(node)).toBe("<pre>42:obj</pre>");
  });

  test("null reaches the component; written children are not replaced", async () => {
    const Comp = ({ children }: { children?: unknown }) => jsx("div", { children });
    const node = jsx(Comp, { dangerouslySetInnerHTML: null, children: "biz" });
    expect(await renderToString(node)).toBe("<div>biz</div>");
  });

  test("getter on the prop is not read at JSX construction", () => {
    let reads = 0;
    const props: Record<string, unknown> = {};
    Object.defineProperty(props, "dangerouslySetInnerHTML", {
      enumerable: true,
      get() {
        reads++;
        return { __html: "<b>x</b>" };
      },
    });
    const Comp = () => jsx("div", {});
    jsx(Comp, props as never);
    expect(reads).toBe(0);
  });
});

describe("children and dangerouslySetInnerHTML on an HTML tag", () => {
  // React's rule, with React's exact condition (`pushInnerHTML` in react-dom):
  // the two are concurrent sources of content, refused at construction, where
  // jsx() already judges void children and tag names. `null`/`undefined`
  // children are no content; `false` is a value React counts, so
  // `{cond && <b />}` refuses with cond false.

  test("written children refuse: TypeError, at construction", () => {
    expect(() =>
      jsx("div", { dangerouslySetInnerHTML: { __html: "<b>x</b>" }, children: "y" }),
    ).toThrow("cannot have both children and dangerouslySetInnerHTML");
  });

  test("the refusal carries the dedicated error code", () => {
    let thrown: unknown;
    try {
      jsx("div", { dangerouslySetInnerHTML: { __html: "<b>x</b>" }, children: "y" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).toMatchObject({ code: "ERR_VINCLE_AMBIGUOUS_HTML_CHILDREN" });
  });

  test("false children count as content: {cond && <b />} refuses", () => {
    expect(() =>
      jsx("div", { dangerouslySetInnerHTML: { __html: "<b>x</b>" }, children: false }),
    ).toThrow("cannot have both children and dangerouslySetInnerHTML");
  });

  test("an array of children refuses as one source", () => {
    expect(() =>
      jsx("div", { dangerouslySetInnerHTML: { __html: "<b>x</b>" }, children: ["a", null] }),
    ).toThrow("cannot have both children and dangerouslySetInnerHTML");
  });

  test("null children are no content: __html applies", async () => {
    const node = jsx("div", {
      dangerouslySetInnerHTML: { __html: "<b>x</b>" },
      children: null,
    });
    expect(await renderToString(node)).toBe("<div><b>x</b></div>");
  });

  test("a null prop is no prop: children render, nothing is replaced", async () => {
    const node = jsx("div", { dangerouslySetInnerHTML: null, children: "biz" });
    expect(await renderToString(node)).toBe("<div>biz</div>");
  });

  test("a null prop on a void element leaves it legal and childless", async () => {
    expect(await renderToString(jsx("input", { dangerouslySetInnerHTML: null }))).toBe("<input>");
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

  test("boolean true for buffer attribute", () => {
    const r = jsxAttr("buffer", true) as RawString;
    expect(r.value).toBe("buffer");
  });

  test("boolean false for buffer attribute", () => {
    const r = jsxAttr("buffer", false) as RawString;
    expect(r.value).toBe("");
  });

  test("boolean true for sanitize attribute", () => {
    const r = jsxAttr("sanitize", true) as RawString;
    expect(r.value).toBe("sanitize");
  });

  test("boolean false for sanitize attribute", () => {
    const r = jsxAttr("sanitize", false) as RawString;
    expect(r.value).toBe("");
  });

  // The fragment is bare: the separating space is the transform's, and
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

describe("createElement", () => {
  test("zero positional children: original attrs passed through untouched", () => {
    const Comp = () => jsx("div", {});
    const attrs = { key: "k", children: "from-attrs" };
    const node = createElement(Comp, attrs) as VNode;
    expect(node.attrs).toBe(attrs);
    expect(node.attrs["children"]).toBe("from-attrs");
  });

  test("one child: attrs copied, children scalar", async () => {
    const Comp = (p: { class?: unknown; children?: unknown }) =>
      jsx("div", { class: p.class, children: p.children });
    const attrs = { class: "foo", children: "from-attrs" };
    const node = createElement(Comp, attrs, "positional") as VNode;
    expect(node.attrs).not.toBe(attrs);
    expect(node.attrs["children"]).toBe("positional");
    expect(attrs.children).toBe("from-attrs");
    expect(await renderToString(node)).toBe('<div class="foo">positional</div>');
  });

  test("many children: attrs copied, children array", async () => {
    const node = createElement("ul", { id: "list" }, "a", "b", "c");
    expect(await renderToString(node)).toBe('<ul id="list">abc</ul>');
  });

  test("explicit positional undefined overrides original children", async () => {
    const node = createElement("div", { children: "from-attrs" }, undefined);
    expect(await renderToString(node)).toBe("<div></div>");
  });

  test("frozen props: no mutation, renders", async () => {
    const frozen = Object.freeze({ class: "foo" });
    const node = createElement("div", frozen, "hi");
    expect(await renderToString(node)).toBe('<div class="foo">hi</div>');
    expect(Object.hasOwn(frozen, "children")).toBe(false);
  });

  test("component key retained through the copy", async () => {
    const Comp = ({ key, children }: { key?: unknown; children?: unknown }) =>
      jsx("span", { children: `${String(key)}:${String(children)}` });
    const node = createElement(Comp, { key: "k1" }, "v");
    expect(await renderToString(node)).toBe("<span>k1:v</span>");
  });
});

describe("component dangerous prop timing", () => {
  test("business values reach the component by identity", async () => {
    for (const value of [null, { __html: 42 }]) {
      const props = { dangerouslySetInnerHTML: value };
      const Comp = (received: typeof props) => {
        expect(received).toBe(props);
        expect(received.dangerouslySetInnerHTML).toBe(value);
        return "ok";
      };
      expect(await renderToString(jsx(Comp, props))).toBe("ok");
    }
  });
  test("an unused throwing business getter is never read", async () => {
    const props = {
      get dangerouslySetInnerHTML(): never {
        throw new Error("must not read");
      },
    };
    expect(await renderToString(jsx(() => "ok", props))).toBe("ok");
  });
  test("component reads business getter only under its Provider", async () => {
    const Language = createContext("fr");
    let reads = 0;
    const props = {
      get dangerouslySetInnerHTML() {
        reads++;
        return useContext(Language);
      },
    };
    const Comp = (p: typeof props) => jsx("b", { children: p.dangerouslySetInnerHTML });
    const child = jsx(Comp, props);
    expect(reads).toBe(0);
    expect(await renderToString(jsx(Language.Provider, { value: "en", children: child }))).toBe(
      "<b>en</b>",
    );
    expect(reads).toBe(1);
  });
});
