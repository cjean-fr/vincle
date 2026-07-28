import { describe, expect, test } from "bun:test";

import { renderToString } from "./create-element-async.js";
import { jsx, Fragment } from "./jsx-runtime.js";

describe("renderToString (async)", () => {
  test("sync tree renders correctly", async () => {
    const v = jsx("div", { className: "x", children: "hello" });
    expect(await renderToString(v)).toBe('<div class="x">hello</div>');
  });

  test("bigint works in async path", async () => {
    const v = jsx("div", { children: 42n });
    expect(await renderToString(v)).toBe("<div>42</div>");
  });

  test("component returning Promise<VNode>", async () => {
    function AsyncComp() {
      return Promise.resolve(jsx("span", { children: "loaded" }));
    }
    const v = jsx("div", { children: jsx(AsyncComp, {}) });
    expect(await renderToString(v)).toBe("<div><span>loaded</span></div>");
  });

  test("component returning Promise<string>", async () => {
    function AsyncLabel() {
      return Promise.resolve("async text");
    }
    const v = jsx("div", { children: jsx(AsyncLabel, {}) });
    expect(await renderToString(v)).toBe("<div>async text</div>");
  });

  test("Promise in children array (parallel)", async () => {
    const v = jsx("div", {
      children: [
        Promise.resolve(jsx("span", { children: "a" })),
        Promise.resolve(jsx("span", { children: "b" })),
      ],
    });
    expect(await renderToString(v)).toBe("<div><span>a</span><span>b</span></div>");
  });

  test("async component as non-first child in an otherwise-sync array", async () => {
    // Regression: the child pre-scan used to check `child instanceof Promise`
    // on the *raw* children, before any component was invoked. An async
    // component shows up there as a plain VNode (tag = function) — its
    // Promise-ness only appears after calling it — so it slipped through the
    // fast sync path and got string-coerced into "[object Promise]".
    async function Async() {
      await Promise.resolve();
      return jsx("span", { children: "ok" });
    }
    const v = jsx("div", {
      children: [jsx("p", { children: "static" }), jsx(Async, {})],
    });
    expect(await renderToString(v)).toBe("<div><p>static</p><span>ok</span></div>");
  });

  test("Fragment with async children", async () => {
    const v = jsx(Fragment, {
      children: [
        Promise.resolve(jsx("a", { children: "link" })),
        " text ",
        Promise.resolve(jsx("b", { children: "bold" })),
      ],
    });
    expect(await renderToString(v)).toBe("<a>link</a> text <b>bold</b>");
  });

  test("Promise<VNode> at root", async () => {
    const p = Promise.resolve(jsx("main", { children: "root" }));
    expect(await renderToString(p)).toBe("<main>root</main>");
  });

  test("async iterable as children", async () => {
    async function* gen() {
      yield jsx("li", { children: "one" });
      yield jsx("li", { children: "two" });
    }
    const v = jsx("ul", { children: gen() });
    expect(await renderToString(v)).toBe("<ul><li>one</li><li>two</li></ul>");
  });

  test("component returning Promise<bigint>", async () => {
    function AsyncBigint() {
      return Promise.resolve(42n);
    }
    const v = jsx("div", { children: jsx(AsyncBigint, {}) });
    expect(await renderToString(v)).toBe("<div>42</div>");
  });
});
