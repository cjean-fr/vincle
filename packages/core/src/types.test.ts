import { describe, expect, test } from "bun:test";

import { renderToString } from "./render.js";
import { RawString, VNode, raw } from "./types.js";

// ── VNode: the tag gate ────────────────────────────────────────────────────
//
// `VNode` is exported as a value — the precompile contract needs
// `instanceof VNode` — so its constructor is public API whether or not anyone is
// meant to call it. The tree walk trusts the tag it finds there and does not
// re-check it, which is why the check has to be here: a name that got in
// unexamined was written into the document verbatim, closing tag and all.

describe("the VNode constructor", () => {
  test("refuses a tag name that would break out of the element", () => {
    expect(() => new VNode("/div><script>alert(1)</script", {}, null)).toThrow(TypeError);
    expect(() => new VNode('img src=x onerror="alert(1)"', {}, null)).toThrow(/Invalid tag name/);
    expect(() => new VNode("", {}, null)).toThrow(/Invalid tag name/);
    expect(() => new VNode("!doctype", {}, null)).toThrow(/Invalid tag name/);
  });

  test("the refusal is the same one `jsx()` gives, from the same message", () => {
    expect(() => new VNode("a b", {}, null)).toThrow(/\[vincle\/core\] Invalid tag name "a b"/);
  });

  test("accepts what a compiler emits: element names, custom elements, components", () => {
    expect(new VNode("div", {}, null).tag).toBe("div");
    expect(new VNode("my-widget", {}, null).tag).toBe("my-widget");
    expect(new VNode("svg:rect", {}, null).tag).toBe("svg:rect");
    const Comp = (): string => "x";
    expect(new VNode(Comp, {}, null).tag).toBe(Comp);
  });

  test("a hand-built node still renders", async () => {
    expect(await renderToString(new VNode("p", { id: "x" }, "hi"))).toBe('<p id="x">hi</p>');
  });
});

// ── raw / RawString ────────────────────────────────────────────────────────

describe("raw()", () => {
  test("wraps its value verbatim", () => {
    const r = raw("<b>x</b> & more");
    expect(r).toBeInstanceOf(RawString);
    expect(r.value).toBe("<b>x</b> & more");
    expect(String(r)).toBe("<b>x</b> & more");
  });
});
