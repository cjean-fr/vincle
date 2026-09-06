import { describe, expect, test } from "bun:test";

import { jsx } from "./jsx-runtime.js";
import { RawString, VNode, raw } from "./types.js";

// ── VNode: the tag gate ────────────────────────────────────────────────────
//
// The tag is judged at the door — `jsx()`, the only way an element is built —
// because the tree walk trusts the tag it finds and does not re-check it. A
// name that got in unexamined was written into the document verbatim, closing
// tag and all. The gate is on the door, not on the exits, so the test asserts
// it on every exit of the fork: static, VNode, `dsih`, component.

describe("the tag gate", () => {
  test("refuses a tag name that would break out of the element", () => {
    expect(() => jsx("/div><script>alert(1)</script", {})).toThrow(TypeError);
    expect(() => jsx('img src=x onerror="alert(1)"', {})).toThrow(/Invalid tag name/);
    expect(() => jsx("", {})).toThrow(/Invalid tag name/);
    expect(() => jsx("!doctype", {})).toThrow(/Invalid tag name/);
  });

  test("the refusal carries the same message the walk used to get from the constructor", () => {
    expect(() => jsx("a b", {})).toThrow(/\[vincle\/core\] Invalid tag name "a b"/);
  });

  test("accepts what a compiler emits, on every exit of the fork", () => {
    const Comp = (): string => "x";
    // static exit — judged before `serializeStatic` takes over
    expect(jsx("div", {})).toBeInstanceOf(RawString);
    // VNode exit — a promised child bails the static path
    expect((jsx("my-widget", { children: Promise.resolve("x") }) as VNode).tag).toBe("my-widget");
    // `dsih` exit — serialized or not, the name was judged first
    expect((jsx("svg:rect", { dangerouslySetInnerHTML: { __html: "x" } }) as VNode).tag).toBe(
      "svg:rect",
    );
    // component exit — a function tag is not a name to judge
    expect((jsx(Comp, {}) as VNode).tag).toBe(Comp);
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
