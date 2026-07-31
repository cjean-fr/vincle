import { describe, expect, test } from "bun:test";

import { buildAttrs } from "./attrs.js";
import { context, setContext, useContext, withScope } from "./context.js";
import { jsxTemplate, jsxAttr, jsxEscape } from "./jsx-precompile-runtime.js";
import { jsx } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { raw, RawString, VNode } from "./types.js";

describe("jsxTemplate", () => {
  test("static template", () => {
    expect((jsxTemplate`<div class="x">hello</div>` as RawString).value).toBe(
      '<div class="x">hello</div>',
    );
  });

  test("template with escaped content", () => {
    const name = "world";
    expect((jsxTemplate`<div>${jsxEscape(name)}</div>` as RawString).value).toBe(
      "<div>world</div>",
    );
  });

  test("template with escaped content needing escaping", () => {
    expect((jsxTemplate`<div>${jsxEscape("<script>")}</div>` as RawString).value).toBe(
      "<div>&lt;script&gt;</div>",
    );
  });

  test("template with dynamic attribute", () => {
    expect((jsxTemplate`<div ${jsxAttr("class", "foo")}>text</div>` as RawString).value).toBe(
      '<div class="foo">text</div>',
    );
  });

  test("template with multiple dynamic parts", () => {
    expect(
      (jsxTemplate`<a ${jsxAttr("href", "/page")}>${jsxEscape("click")}</a>` as RawString).value,
    ).toBe('<a href="/page">click</a>');
  });

  test("nested jsxTemplate", () => {
    const inner = jsxTemplate`<span>${jsxEscape("inner")}</span>` as RawString;
    expect((jsxTemplate`<div>${jsxEscape(inner)}</div>` as RawString).value).toBe(
      "<div><span>inner</span></div>",
    );
  });

  test("boolean attribute true", () => {
    expect((jsxTemplate`<input ${jsxAttr("disabled", true)}>` as RawString).value).toBe(
      "<input disabled>",
    );
  });

  test("boolean attribute false", () => {
    expect((jsxTemplate`<input ${jsxAttr("disabled", false)}>` as RawString).value).toBe(
      "<input >",
    );
  });

  test("null/undefined attribute", () => {
    expect((jsxAttr("hidden", null) as RawString).value).toBe("");
    expect((jsxAttr("hidden", undefined) as RawString).value).toBe("");
  });

  test("className mapping", () => {
    expect((jsxTemplate`<div ${jsxAttr("className", "box")}>text</div>` as RawString).value).toBe(
      '<div class="box">text</div>',
    );
  });

  test("style string attribute", () => {
    expect((jsxTemplate`<div ${jsxAttr("style", "color:red")}>text</div>` as RawString).value).toBe(
      '<div style="color:red">text</div>',
    );
  });

  test("style object attribute", () => {
    expect(
      (
        jsxTemplate`<div ${jsxAttr("style", { color: "red", fontSize: "14px" })}>text</div>` as RawString
      ).value,
    ).toBe('<div style="color:red;font-size:14px">text</div>');
  });

  test("class array", () => {
    expect((jsxTemplate`<div ${jsxAttr("class", ["a", "b"])}>text</div>` as RawString).value).toBe(
      '<div class="a b">text</div>',
    );
  });

  test("RawString pass-through", () => {
    expect((jsxTemplate`<div>${jsxEscape(raw("<b>safe</b>"))}</div>` as RawString).value).toBe(
      "<div><b>safe</b></div>",
    );
  });

  test("number value", () => {
    expect((jsxTemplate`<span>${jsxEscape(42)}</span>` as RawString).value).toBe("<span>42</span>");
  });

  test("htmlFor mapping", () => {
    expect(
      (jsxTemplate`<label ${jsxAttr("htmlFor", "email")}>Email</label>` as RawString).value,
    ).toBe('<label for="email">Email</label>');
  });

  test("blocks javascript: href", () => {
    expect((jsxAttr("href", "javascript:alert(1)") as RawString).value).toContain("#blocked");
  });

  test("blocks javascript: href via jsxTemplate", () => {
    expect(
      (jsxTemplate`<a ${jsxAttr("href", "javascript:alert(1)")}>x</a>` as RawString).value,
    ).toBe('<a href="#blocked">x</a>');
  });

  test("allows http href", () => {
    expect((jsxAttr("href", "https://example.com") as RawString).value).toBe(
      'href="https://example.com"',
    );
  });

  test("allows relative href", () => {
    expect((jsxAttr("href", "/page") as RawString).value).toBe('href="/page"');
    expect((jsxAttr("href", "#section") as RawString).value).toBe('href="#section"');
    expect((jsxAttr("href", "?query") as RawString).value).toBe('href="?query"');
  });

  test("allows mailto href", () => {
    expect((jsxAttr("href", "mailto:test@example.com") as RawString).value).toBe(
      'href="mailto:test@example.com"',
    );
  });

  test("blocks vbscript: href", () => {
    expect((jsxAttr("href", "vbscript:msgbox(1)") as RawString).value).toContain("#blocked");
  });

  test("safe src is unaffected", () => {
    expect((jsxAttr("src", "/image.png") as RawString).value).toBe('src="/image.png"');
  });

  test("blocks javascript: src", () => {
    expect((jsxAttr("src", "javascript:alert(1)") as RawString).value).toContain("#blocked");
  });

  test("non-URL attribute is not checked", () => {
    expect((jsxAttr("id", "javascript:is-ok-here") as RawString).value).toBe(
      'id="javascript:is-ok-here"',
    );
  });

  test("allows javascript: in srcset (no JS execution vector)", () => {
    expect((jsxAttr("srcSet", "javascript:alert(1) 1x") as RawString).value).toBe(
      'srcset="javascript:alert(1) 1x"',
    );
  });

  test("safe srcset is unaffected", () => {
    expect((jsxAttr("srcSet", "/img.png 1x, /img2.png 2x") as RawString).value).toContain(
      "/img.png",
    );
  });
});

// ── Path equivalence: jsxAttr ≡ buildAttrs ─────────────────────────────────
//
// The precompile transform and the VNode runtime are two independent attribute
// serializers over the same JSX. Any value kind they disagree on is a hole: the
// same source renders differently — or crashes — depending on whether the Vite
// precompile plugin happens to be enabled.
//
// Four such holes existed. `jsxAttr` special-cased `on…` names, dropping
// `onClick={fn}` with a warning where `buildAttrs` threw; it carried its own
// hardcoded list of URL attributes, which had already drifted from
// `URL_ATTRIBUTES` — `<object data="javascript:…">` went unchecked here only; it
// awaited a promised value where `buildAttrs` wrote `[object Promise]`; and it
// emitted a hostile attribute name verbatim where `buildAttrs` dropped it.
//
// The last one was the sharp one: `jsxAttr('x"><script>', v)` closed the start tag.
// A case list is the only guard that finds this class of bug, because each hole
// lived in a value kind nobody thought to write down twice.

describe("jsxAttr ≡ buildAttrs", () => {
  /** `buildAttrs` emits ` name="v"`; `jsxAttr` emits `name="v"`. */
  const viaBuildAttrs = async (key: string, value: unknown): Promise<string> =>
    (await buildAttrs({ [key]: value })).trimStart();
  const viaJsxAttr = async (key: string, value: unknown): Promise<string> =>
    (await jsxAttr(key, value)).value;

  const CASES: [string, unknown][] = [
    // Handlers are plain attributes on both paths — emitted, not dropped.
    ["onClick", 'alert("x") & 1'],
    ["onClick", 42],
    ["class", "foo"],
    ["className", "foo"],
    ["class", ["a", "", "b"]],
    ["href", "javascript:alert(1)"],
    ["href", "java\tscript:alert(1)"],
    ["href", "/page"],
    ["href", "recherche?q=café:test"],
    ["data", "javascript:alert(1)"],
    ["style", { backgroundColor: "red" }],
    ["style", { "color:red;position": "fixed" }],
    ["disabled", true],
    ["disabled", false],
    // A boolean on an attribute that is *not* a boolean attribute: the name alone
    // would mean something else entirely.
    ["data-active", true],
    ["data-active", false],
    ["title", "a & b < c"],
    ["title", raw("<b>trusted</b>")],
    ["tabIndex", 3],
    // A `RawString` is an object: read as a style bag it serialized as
    // `style="value:color:red"` on the VNode path only.
    ["style", raw("color:red")],
    // …and so is any class instance. Neither is a bag of declarations.
    ["style", new Date(0)],
    // Promised values: the type has always allowed them.
    ["href", Promise.resolve("/late")],
    ["title", Promise.resolve("a & b")],
    // A name that closes the start tag must be dropped, on both paths.
    ['x"><script>alert(1)</script>', "y"],
    ["a b", "y"],
    ["a=b", "y"],
  ];

  for (const [key, value] of CASES) {
    test(`${key}=${JSON.stringify(value) ?? String(value)}`, async () => {
      expect(await viaJsxAttr(key, value)).toBe(await viaBuildAttrs(key, value));
    });
  }

  // Equivalence alone would be satisfied by both paths being wrong, so the two
  // shapes that used to break out of the tag are pinned to their value too.
  test("a hostile name produces nothing at all", async () => {
    expect(await viaJsxAttr('x"><script>', "y")).toBe("");
    expect(await viaBuildAttrs('x"><script>', "y")).toBe("");
  });

  test("a promised value is awaited, not stringified", async () => {
    expect(await viaJsxAttr("href", Promise.resolve("/late"))).toBe('href="/late"');
    expect(await viaBuildAttrs("href", Promise.resolve("/late"))).toBe('href="/late"');
  });

  test("a promised value is still checked for an unsafe scheme", async () => {
    expect(await viaJsxAttr("href", Promise.resolve("javascript:alert(1)"))).toBe(
      'href="#blocked"',
    );
    expect(await viaBuildAttrs("href", Promise.resolve("javascript:alert(1)"))).toBe(
      'href="#blocked"',
    );
  });

  // The regression guard for the divergence above: an `on…` function must throw
  // on *both* paths, exactly like any other unserializable value.
  test("a function throws on both paths, handler or not", () => {
    expect(() => jsxAttr("onClick", () => {})).toThrow(/not serializable/);
    expect(() => buildAttrs({ onClick: () => {} })).toThrow(/not serializable/);
    expect(() => jsxAttr("title", () => {})).toThrow(/not serializable/);
    expect(() => buildAttrs({ title: () => {} })).toThrow(/not serializable/);
  });
});

// ── The async surface ──────────────────────────────────────────────────────
//
// `jsxEscape` handles arrays, iterables, async iterables and promises; that is
// the "async is native, the developer asks for nothing" promise on the
// precompiled path. None of it was covered: `escapeArray`, `collectAsyncIterable`
// and `jsxTemplate`'s promise branch were three untested functions carrying
// benchmark numbers in their comments — including the one the comment calls "the
// call a precompiled list page spends most of its time in".
//
// Every case below is checked against the same value rendered through the VNode
// engine, because "it produces something" is not the contract — "it produces the
// same document" is.

describe("jsxEscape — synchronous collections", () => {
  const value = async (v: unknown): Promise<string> => {
    const r = await jsxEscape(v);
    if (r instanceof VNode) throw new Error("unexpected VNode from jsxEscape");
    return r.value;
  };

  test("an array is concatenated, each item escaped", async () => {
    expect(await value(["a & b", 1, null, undefined, false, true, 2n])).toBe("a &amp; b12");
  });

  test("nested arrays flatten", async () => {
    expect(await value([["a", ["b", ["c"]]], "d"])).toBe("abcd");
  });

  test("a RawString inside an array is not re-escaped", async () => {
    expect(await value(["<", raw("<b>x</b>"), ">"])).toBe("&lt;<b>x</b>&gt;");
  });

  test("a non-array iterable is drained", async () => {
    expect(await value(new Set(["a", "<b>"]))).toBe("a&lt;b&gt;");
    // A Map yields `[key, value]` pairs, which are arrays, so they flatten.
    expect(await value(new Map([["k", "v"]]))).toBe("kv");
    function* gen() {
      yield "x";
      yield 1;
    }
    expect(await value(gen())).toBe("x1");
  });

  test("an empty collection produces nothing", async () => {
    expect(await value([])).toBe("");
    expect(await value(new Set())).toBe("");
  });
});

describe("jsxEscape — promises and async iterables", () => {
  const value = async (v: unknown): Promise<string> => {
    const r = await jsxEscape(v);
    if (r instanceof VNode) throw new Error("unexpected VNode from jsxEscape");
    return r.value;
  };
  const later = <T>(v: T, ms = 1): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(v), ms));

  test("a promise is awaited and its result escaped", async () => {
    expect(await value(later("a & b"))).toBe("a &amp; b");
    expect(await value(later(raw("<b>x</b>")))).toBe("<b>x</b>");
  });

  test("a promise of a promise is flattened", async () => {
    expect(await value(later(later("deep")))).toBe("deep");
  });

  test("a promise of an array is escaped item by item", async () => {
    expect(await value(later(["<", "a"]))).toBe("&lt;a");
  });

  // The bail-to-async path: everything before the first promise is already final
  // text and must survive verbatim, in order, however many promises follow.
  test("an array mixing sync and async keeps document order", async () => {
    expect(await value(["a", later("b"), "c", later("d"), "e"])).toBe("abcde");
  });

  test("a promise in first position still keeps the tail", async () => {
    expect(await value([later("a"), "b", "c"])).toBe("abc");
  });

  test("a slow item does not overtake a fast one that follows it", async () => {
    expect(await value([later("slow", 20), later("fast", 1)])).toBe("slowfast");
  });

  test("an async iterable is drained in order", async () => {
    async function* gen() {
      yield "a";
      yield await later("b");
      yield ["c", later("d")];
      yield raw("<i>e</i>");
    }
    expect(await value(gen())).toBe("abcd<i>e</i>");
  });

  test("an async iterable yielding nothing produces nothing", async () => {
    async function* empty(): AsyncGenerator<string> {}
    expect(await value(empty())).toBe("");
  });

  test("a rejection propagates instead of being swallowed", async () => {
    await expect(jsxEscape(Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(jsxEscape(["ok", Promise.reject(new Error("boom"))])).rejects.toThrow("boom");
  });
});

describe("jsxTemplate — promise holes", () => {
  const value = async (v: RawString | Promise<RawString>): Promise<string> => (await v).value;
  const later = <T>(v: T, ms = 1): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(v), ms));

  test("a promised hole is awaited, and the static parts stay put", async () => {
    expect(await value(jsxTemplate`<p>${jsxEscape(later("x & y"))}</p>`)).toBe("<p>x &amp; y</p>");
  });

  test("the prefix before the first promise is preserved verbatim", async () => {
    expect(
      await value(
        jsxTemplate`<a ${jsxAttr("href", "/p")}>${jsxEscape("sync")}|${jsxEscape(later("async"))}</a>`,
      ),
    ).toBe('<a href="/p">sync|async</a>');
  });

  test("several promised holes interleave with their templates in order", async () => {
    expect(
      await value(
        jsxTemplate`[${jsxEscape(later("1"))}|${jsxEscape(later("2"))}|${jsxEscape("3")}]`,
      ),
    ).toBe("[1|2|3]");
  });

  test("a promised attribute lands inside the tag", async () => {
    expect(await value(jsxTemplate`<a ${jsxAttr("href", later("/late"))}>x</a>`)).toBe(
      '<a href="/late">x</a>',
    );
  });

  test("a raw promise hole — not wrapped in jsxEscape — is awaited too", async () => {
    expect(await value(jsxTemplate`<p>${later(raw("<b>x</b>"))}</p>`)).toBe("<p><b>x</b></p>");
  });

  test("a rejected hole rejects the template", async () => {
    await expect(jsxTemplate`<p>${Promise.reject(new Error("boom"))}</p>`).rejects.toThrow("boom");
  });
});

// ── VNode holes — the Deno/Preact precompile contract ──────────────────────
//
// The transform leaves component elements in place (`jsxTemplate`(…, `<Foo/>`,
// …)); the compiler turns them into `jsx(Foo, …)` VNodes. `jsxEscape` must let
// a VNode pass through untouched — it is markup to render, not a value to
// escape — and `jsxTemplate` renders it through the tree walk. Stringifying
// the VNode was the `[object Object]` bug that broke every component once the
// precompile plugin was enabled.

describe("jsxEscape — VNode contract", () => {
  test("a VNode passes through untouched, not stringified", () => {
    const vnode = jsx("div", { children: "x" });
    expect(jsxEscape(vnode)).toBe(vnode);
  });

  test("a VNode inside an array passes through the escape walk", async () => {
    const vnode = jsx("b", { children: "bold" });
    const out = await jsxEscape(["a ", vnode, " c"]);
    expect(out instanceof RawString).toBe(true);
    expect((out as RawString).value).toBe("a <b>bold</b> c");
  });
});

describe("jsxTemplate — VNode holes", () => {
  const value = async (v: RawString | Promise<RawString>): Promise<string> => (await v).value;

  test("a component hole renders its markup", async () => {
    const Foo = ({ x }: { x: number }) => jsx("b", { children: `x=${x}` });
    expect(await value(jsxTemplate`<div>${jsx(Foo, { x: 1 })}</div>`)).toBe(
      "<div><b>x=1</b></div>",
    );
  });

  test("an async component hole is awaited", async () => {
    const later = <T>(v: T, ms = 1): Promise<T> =>
      new Promise((resolve) => setTimeout(() => resolve(v), ms));
    const AsyncFoo = async () => {
      await later(null, 1);
      return jsx("i", { children: "late" });
    };
    expect(await value(jsxTemplate`<div>${jsx(AsyncFoo, {})}</div>`)).toBe(
      "<div><i>late</i></div>",
    );
  });

  test("a component hole inside an array renders", async () => {
    const Li = () => jsx("li", { children: "item" });
    expect(await value(jsxTemplate`<ul>${jsxEscape([jsx(Li, {}), jsx(Li, {})])}</ul>`)).toBe(
      "<ul><li>item</li><li>item</li></ul>",
    );
  });

  test("a raw JSX element expression — not wrapped in jsxEscape — renders", async () => {
    // What the transform emits for `{<Foo/>}`: jsxEscape around the expression,
    // whose result is the VNode.
    const Foo = () => jsx("span", { children: "hi" });
    expect(await value(jsxTemplate`<div>${jsxEscape(jsx(Foo, {}))}</div>`)).toBe(
      "<div><span>hi</span></div>",
    );
  });

  test("a conditional expression yielding a component renders", async () => {
    const Foo = () => jsx("span", { children: "foo" });
    const tpl = (cond: boolean) => jsxTemplate`<div>${jsxEscape(cond ? jsx(Foo, {}) : null)}</div>`;
    expect(await value(tpl(true))).toBe("<div><span>foo</span></div>");
    expect(await value(tpl(false))).toBe("<div></div>");
  });

  // The regression the `Promise.all` form would reintroduce: sibling holes
  // must render one after the other, in document order, so a `setContext` in
  // the left sibling is visible to the right one — the sequencing rule, held
  // on the precompiled path too.
  test("component holes run in document order — a later hole reads an earlier write", async () => {
    const KEY = context<string>("precompile-order");
    const later = <T>(v: T, ms: number): Promise<T> =>
      new Promise((resolve) => setTimeout(() => resolve(v), ms));
    const Writer = async () => {
      await later(null, 5);
      setContext(KEY, "written");
      return "w";
    };
    const Reader = async () => {
      await later(null, 1);
      return useContext(KEY);
    };

    const build = () => jsxTemplate`<div>${jsx(Writer, {})}${jsx(Reader, {})}</div>`;

    const results = new Set<string>();
    for (let i = 0; i < 5; i++) {
      results.add(
        await withScope(async () => {
          setContext(KEY, "initial");
          return value(build());
        }),
      );
    }
    expect(results.size).toBe(1);
    expect([...results][0]).toBe("<div>wwritten</div>");
  });

  test("the same tree renders identically through precompile and tree walk", async () => {
    const KEY = context<string>("precompile-equivalence");
    const later = <T>(v: T, ms: number): Promise<T> =>
      new Promise((resolve) => setTimeout(() => resolve(v), ms));
    const Writer = async () => {
      await later(null, 2);
      setContext(KEY, "w");
      return "W";
    };
    const Reader = async () => {
      await later(null, 1);
      return useContext(KEY);
    };

    const viaPrecompile = () => jsxTemplate`<p>${jsx(Writer, {})}|${jsx(Reader, {})}</p>`;
    const viaTreeWalk = () => jsx("p", { children: [jsx(Writer, {}), "|", jsx(Reader, {})] });

    const a = await withScope(async () => {
      setContext(KEY, "i");
      return value(viaPrecompile());
    });
    const b = await withScope(async () => {
      setContext(KEY, "i");
      return renderToString(viaTreeWalk());
    });
    expect(a).toBe(b);
    expect(a).toBe("<p>W|w</p>");
  });
});
