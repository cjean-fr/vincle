import { describe, expect, test } from "bun:test";

import { renderToString } from "./create-element.js";
import { jsx } from "./jsx-runtime.js";

describe("renderToString", () => {
  test("basic element", () => {
    const v = jsx("div", { className: "x", children: "hello" });
    expect(renderToString(v)).toBe('<div class="x">hello</div>');
  });

  test("void element", () => {
    const v = jsx("br", {});
    expect(renderToString(v)).toBe("<br>");
  });

  test("nested elements", () => {
    const v = jsx("div", { children: jsx("span", { children: "text" }) });
    expect(renderToString(v)).toBe("<div><span>text</span></div>");
  });

  test("null/false/undefined children are omitted", () => {
    const v = jsx("div", { children: [null, false, undefined] });
    expect(renderToString(v)).toBe("<div></div>");
  });

  test("number as text content", () => {
    const v = jsx("div", { children: 42 });
    expect(renderToString(v)).toBe("<div>42</div>");
  });

  test("escapes text content", () => {
    const v = jsx("div", { children: "<script>alert(1)</script>" });
    expect(renderToString(v)).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });

  describe("bigint", () => {
    test("bigint as text content", () => {
      const v = jsx("div", { children: 9007199254740993n });
      expect(renderToString(v)).toBe("<div>9007199254740993</div>");
    });

    test("bigint as component child", () => {
      const v = jsx("div", { children: [jsx("span", {}), 42n] });
      expect(renderToString(v)).toBe("<div><span></span>42</div>");
    });

    test("bigint mixed with string", () => {
      const v = jsx("div", { children: ["count: ", 100n] });
      expect(renderToString(v)).toBe("<div>count: 100</div>");
    });

    test("bigint in nested tree", () => {
      const v = jsx("div", { children: jsx("p", { children: 0n }) });
      expect(renderToString(v)).toBe("<div><p>0</p></div>");
    });
  });

  describe("text content", () => {
    test("renders string", () => {
      const v = jsx("div", { children: "hello" });
      expect(renderToString(v)).toBe("<div>hello</div>");
    });

    test("renders number 0", () => {
      const v = jsx("div", { children: 0 });
      expect(renderToString(v)).toBe("<div>0</div>");
    });

    test("renders bigint", () => {
      const v = jsx("div", { children: 0n });
      expect(renderToString(v)).toBe("<div>0</div>");
    });
  });
});
