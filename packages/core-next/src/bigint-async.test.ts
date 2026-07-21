import { describe, expect, test } from "bun:test";
import { jsx, jsxs, Fragment, VNode, renderToString, renderToStringAsync } from "./jsx-runtime.js";

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

describe("renderToStringAsync", () => {
  test("sync tree returns same as renderToString", async () => {
    const v = jsx("div", { className: "x", children: "hello" });
    expect(await renderToStringAsync(v)).toBe(renderToString(v));
  });

  test("bigint works in async path", async () => {
    const v = jsx("div", { children: 42n });
    expect(await renderToStringAsync(v)).toBe("<div>42</div>");
  });

  test("component returning Promise<VNode>", async () => {
    function AsyncComp() {
      return Promise.resolve(jsx("span", { children: "loaded" }));
    }
    const v = jsx("div", { children: jsx(AsyncComp, {}) });
    expect(await renderToStringAsync(v)).toBe("<div><span>loaded</span></div>");
  });

  test("component returning Promise<string>", async () => {
    function AsyncLabel() {
      return Promise.resolve("async text");
    }
    const v = jsx("div", { children: jsx(AsyncLabel, {}) });
    expect(await renderToStringAsync(v)).toBe("<div>async text</div>");
  });

  test("Promise in children array (parallel)", async () => {
    const v = jsx("div", {
      children: [
        Promise.resolve(jsx("span", { children: "a" })),
        Promise.resolve(jsx("span", { children: "b" })),
      ],
    });
    expect(await renderToStringAsync(v)).toBe("<div><span>a</span><span>b</span></div>");
  });

  test("Fragment with async children", async () => {
    const v = jsx(Fragment, {
      children: [
        Promise.resolve(jsx("a", { children: "link" })),
        " text ",
        Promise.resolve(jsx("b", { children: "bold" })),
      ],
    });
    expect(await renderToStringAsync(v)).toBe('<a>link</a> text <b>bold</b>');
  });

  test("Promise<VNode> at root", async () => {
    const p = Promise.resolve(jsx("main", { children: "root" }));
    expect(await renderToStringAsync(p)).toBe("<main>root</main>");
  });

  test("async iterable as children", async () => {
    async function* gen() {
      yield jsx("li", { children: "one" });
      yield jsx("li", { children: "two" });
    }
    const v = jsx("ul", { children: gen() });
    expect(await renderToStringAsync(v)).toBe("<ul><li>one</li><li>two</li></ul>");
  });
});
