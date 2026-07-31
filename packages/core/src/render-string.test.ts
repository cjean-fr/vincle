import { describe, expect, test } from "bun:test";

import { jsx, Fragment, VNode } from "./jsx-runtime.js";
import { renderToString } from "./render.js";

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

  test("Promise in children array", async () => {
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

// ── Value kinds the type promises and the walk has to honour ────────────────
//
// `Renderable` declares `Iterable<Renderable>`, and the attribute types declare
// `Awaitable`. Both were declarations the tree walk did not keep: a `Set` rendered
// as `[object Set]`, a promised attribute as `[object Promise]` — while the
// precompile runtime, over the same JSX, awaited and drained them. A type that
// promises something the engine does not do is worse than no type.

describe("synchronous iterables are drained, not stringified", () => {
  test("a Set of children", async () => {
    const v = jsx("ul", { children: new Set([jsx("li", { children: "a" }), "b"]) });
    expect(await renderToString(v)).toBe("<ul><li>a</li>b</ul>");
  });

  test("a generator of children", async () => {
    function* gen() {
      yield jsx("li", { children: "one" });
      yield 2;
      yield null;
    }
    expect(await renderToString(jsx("ul", { children: gen() }))).toBe("<ul><li>one</li>2</ul>");
  });

  test("a generator yielding promises", async () => {
    function* gen() {
      yield Promise.resolve(jsx("li", { children: "a" }));
      yield "b";
    }
    expect(await renderToString(jsx("ul", { children: gen() }))).toBe("<ul><li>a</li>b</ul>");
  });

  test("text is escaped inside an iterable like anywhere else", async () => {
    expect(await renderToString(jsx("p", { children: new Set(["<script>"]) }))).toBe(
      "<p>&lt;script&gt;</p>",
    );
  });

  test("an object that is not iterable still falls back to its string form", async () => {
    expect(await renderToString(jsx("p", { children: new URL("https://x.test/a") }))).toBe(
      "<p>https://x.test/a</p>",
    );
  });
});

describe("promised attribute values are awaited", () => {
  test("on an element with no children", async () => {
    expect(await renderToString(jsx("img", { src: Promise.resolve("/a.png") }))).toBe(
      '<img src="/a.png">',
    );
  });

  test("on an element with static children — the subtree still folds", async () => {
    const node = jsx("a", { href: Promise.resolve("/p"), children: "click" });
    expect(node).toBeInstanceOf(Promise);
    expect(await renderToString(node)).toBe('<a href="/p">click</a>');
  });

  test("on an element with async children", async () => {
    const Slow = async () => "late";
    const node = jsx("a", { href: Promise.resolve("/p"), children: jsx(Slow, {}) });
    expect(await renderToString(node)).toBe('<a href="/p">late</a>');
  });

  test("several promised attributes on one element", async () => {
    const node = jsx("a", {
      href: Promise.resolve("/p"),
      title: Promise.resolve("a & b"),
      class: "c",
    });
    expect(await renderToString(node)).toBe('<a href="/p" title="a &amp; b" class="c"></a>');
  });

  test("attribute order is the source order, promised or not", async () => {
    const node = jsx("div", { a: "1", b: Promise.resolve("2"), c: "3" });
    expect(await renderToString(node)).toBe('<div a="1" b="2" c="3"></div>');
  });

  test("a promised value goes through the same escaping and URL checks", async () => {
    expect(await renderToString(jsx("a", { href: Promise.resolve("javascript:alert(1)") }))).toBe(
      '<a href="#blocked"></a>',
    );
    // `>` is not escaped in an attribute — it cannot end a quoted value. See
    // `escapeAttr`.
    expect(await renderToString(jsx("p", { title: Promise.resolve('"x" & <y>') }))).toBe(
      '<p title="&quot;x&quot; &amp; &lt;y>"></p>',
    );
  });

  test("a rejected attribute rejects the render", async () => {
    await expect(
      renderToString(jsx("a", { href: Promise.reject(new Error("boom")) })),
    ).rejects.toThrow("boom");
  });
});

describe("dangerouslySetInnerHTML", () => {
  test("is inserted verbatim", async () => {
    const v = jsx("div", { dangerouslySetInnerHTML: { __html: "<b>raw</b> & more" } });
    expect(await renderToString(v)).toBe("<div><b>raw</b> & more</div>");
  });

  test("a promised __html is awaited, not stringified", async () => {
    const v = jsx("div", { dangerouslySetInnerHTML: { __html: Promise.resolve("<b>raw</b>") } });
    expect(await renderToString(v)).toBe("<div><b>raw</b></div>");
  });

  test("nullish __html renders an empty element", async () => {
    expect(await renderToString(jsx("div", { dangerouslySetInnerHTML: { __html: null } }))).toBe(
      "<div></div>",
    );
    expect(
      await renderToString(
        jsx("div", { dangerouslySetInnerHTML: { __html: Promise.resolve(null) } }),
      ),
    ).toBe("<div></div>");
  });

  test("it replaces children and is never emitted as an attribute", async () => {
    const v = jsx("div", {
      class: "c",
      dangerouslySetInnerHTML: { __html: "<i>x</i>" },
      children: "ignored",
    });
    expect(await renderToString(v)).toBe('<div class="c"><i>x</i></div>');
  });
});

describe("renderToString never throws synchronously", () => {
  // The signature says `Promise<string>`; a synchronous throw walks straight past
  // `.catch()`. `buildAttrs` is the one that throws during the walk, and only for
  // an element the fold declined — hence the promised child.
  test("an unserializable attribute rejects instead of throwing", async () => {
    let threw = false;
    let promise: Promise<string> | undefined;
    try {
      promise = renderToString(jsx("div", { onClick: () => {}, children: Promise.resolve("x") }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    await expect(promise).rejects.toThrow(/not serializable/);
  });

  test("a component throwing synchronously rejects too", async () => {
    const Boom = () => {
      throw new Error("boom");
    };
    let threw = false;
    let promise: Promise<string> | undefined;
    try {
      promise = renderToString(jsx("div", { children: jsx(Boom, {}) }));
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    await expect(promise).rejects.toThrow("boom");
  });
});

// ── The walk's element contract ────────────────────────────────────────────
//
// Two branches of the element walk are no longer reachable through `jsx()`: an
// element with `children === undefined`, and an element whose children are a
// single string. For a string tag the fold only declines when a *child* is
// dynamic — a promised attribute no longer sends the element down this path, the
// fold awaits it — so both shapes now always fold.
//
// They are kept, and tested here on hand-built nodes, because they are not
// speculation: they carry the void-element rule (`<br>`, not `<br></br>`) and the
// rawtext rule (`<script>` content is not escaped like text). If either shape ever
// reaches the walk again, dropping them would be a silent divergence from the
// fold — so what is pinned below is the *contract*, not a path a document takes
// today. The differential fuzzers are what would notice the day it changes.

describe("element walk contract (guard branches)", () => {
  test("a void element without children keeps its single tag", async () => {
    expect(await renderToString(new VNode("br", {}, undefined))).toBe("<br>");
    expect(await renderToString(new VNode("img", { src: "/a.png" }, undefined))).toBe(
      '<img src="/a.png">',
    );
  });

  test("a non-void element without children still gets a closing tag", async () => {
    expect(await renderToString(new VNode("div", { id: "x" }, undefined))).toBe(
      '<div id="x"></div>',
    );
  });

  test("a single string child is escaped as text", async () => {
    expect(await renderToString(new VNode("p", {}, "a & b < c"))).toBe("<p>a &amp; b &lt; c</p>");
  });

  test("a single string child of a rawtext element follows the rawtext rule", async () => {
    expect(await renderToString(new VNode("script", {}, "if (a < 1) {}"))).toBe(
      "<script>if (a < 1) {}</script>",
    );
    expect(await renderToString(new VNode("script", {}, "</script><img>"))).toBe(
      "<script><\\/script><img></script>",
    );
    expect(await renderToString(new VNode("style", {}, "a { color: red }"))).toBe(
      "<style>a { color: red }</style>",
    );
  });
});
