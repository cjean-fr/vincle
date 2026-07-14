import { describe, it, expect, beforeEach } from "bun:test";

import {
  render,
  renderToString,
  raw,
  ErrorBoundary,
  context,
  setContext,
  useContext,
  withScope,
  resetContextStorage,
  type VNode,
  type ContextMap,
} from "./index.js";
import { jsx } from "./jsx-runtime.js";

beforeEach(() => resetContextStorage());

describe("renderToString", () => {
  it("renders a raw string unchanged", async () => {
    expect(await renderToString(raw("<b>bold</b>"))).toBe("<b>bold</b>");
  });

  it("renders a promise resolving to RawString", async () => {
    const node = Promise.resolve(raw("<i>text</i>"));
    expect(await renderToString(node)).toBe("<i>text</i>");
  });

  it("escapes plain string content", async () => {
    expect(await renderToString("<script>alert(1)</script>")).toBe(
      "&lt;script>alert(1)&lt;/script>",
    );
  });

  it("renders number as string", async () => {
    expect(await renderToString(42)).toBe("42");
  });

  it("renders zero as string (not falsy)", async () => {
    expect(await renderToString(0)).toBe("0");
  });

  it("ignores null/undefined/boolean", async () => {
    expect(await renderToString(null)).toBe("");
    expect(await renderToString(undefined)).toBe("");
    expect(await renderToString(true)).toBe("");
    expect(await renderToString(false)).toBe("");
  });

  it("renders an array by concatenating", async () => {
    expect(await renderToString(["a", raw("<b>"), "c"])).toBe("a<b>c");
  });

  it("escapes string items in array", async () => {
    expect(await renderToString(["<a>", "<b>"])).toBe("&lt;a>&lt;b>");
  });

  it("renders nested arrays", async () => {
    expect(await renderToString(["a", ["b", ["c"]]])).toBe("abc");
  });

  it("resolves Promise in array", async () => {
    expect(await renderToString(["a", Promise.resolve("b"), "c"])).toBe("abc");
  });

  it("handles mixed sync/async array", async () => {
    const mixed: VNode[] = [
      raw("<b>safe</b>"),
      Promise.resolve("raw & text"),
      Promise.resolve(raw("<i>also safe</i>")),
      "plain",
    ];
    expect(await renderToString(mixed)).toBe("<b>safe</b>raw &amp; text<i>also safe</i>plain");
  });

  it("renders sync generator", async () => {
    function* items(): Generator<VNode, void> {
      yield "a";
      yield "b";
    }
    expect(await renderToString(items())).toBe("ab");
  });

  it("renders Set", async () => {
    const set: VNode[] = ["a", "b"];
    expect(await renderToString(new Set(set))).toBe("ab");
  });

  it("renders Map values", async () => {
    const m = new Map<string, VNode>([["x", 1]]);
    expect(await renderToString(m.values())).toBe("1");
  });

  it("renders async generator (buffered)", async () => {
    async function* items(): AsyncGenerator<VNode, void> {
      yield "a";
      await Promise.resolve();
      yield "b";
    }
    expect(await renderToString(items())).toBe("ab");
  });
});

describe("render (sync)", () => {
  it("returns a string for sync content", () => {
    const result = render("hello");
    expect(typeof result).toBe("string");
    expect(result).toBe("hello");
  });

  it("escapes sync content", () => {
    expect(render("<script>")).toBe("&lt;script>");
  });

  it("returns RawString value verbatim", () => {
    expect(render(raw("<b>ok</b>"))).toBe("<b>ok</b>");
  });

  it("returns number as string", () => {
    expect(render(0)).toBe("0");
  });

  it("returns bigint as string", () => {
    expect(render(BigInt(123))).toBe("123");
  });

  it("ignores null/undefined/boolean synchronously", () => {
    expect(render(null)).toBe("");
    expect(render(undefined)).toBe("");
    expect(render(true)).toBe("");
    expect(render(false)).toBe("");
  });

  it("returns Promise for async content", () => {
    const result = render(Promise.resolve("hello"));
    expect(result).toBeInstanceOf(Promise);
  });
});

describe("ErrorBoundary", () => {
  it("catches sync error and renders fallback", async () => {
    function Boom(): never {
      throw new Error("fail");
    }
    const html = await renderToString(
      jsx(ErrorBoundary, {
        fallback: raw("<p>fallback</p>"),
        children: jsx(Boom, {}),
      }),
    );
    expect(html).toBe("<p>fallback</p>");
  });

  it("catches async error", async () => {
    async function AsyncBoom(): Promise<any> {
      await Promise.resolve();
      throw new Error("async-fail");
    }
    const html = await renderToString(
      jsx(ErrorBoundary, {
        fallback: raw("<p>caught</p>"),
        children: jsx(AsyncBoom, {}),
      }),
    );
    expect(html).toBe("<p>caught</p>");
  });

  it("catches Promise child rejection", async () => {
    const html = await renderToString(
      jsx(ErrorBoundary, {
        fallback: raw("<p>caught-promise</p>"),
        children: Promise.reject(new Error("rejected")),
      }),
    );
    expect(html).toBe("<p>caught-promise</p>");
  });

  it("fallback function receives the error", async () => {
    function Boom(): never {
      throw new Error("broken-part");
    }
    const html = await renderToString(
      jsx(ErrorBoundary, {
        fallback: (e: unknown) => raw(`<p>Error: ${(e as Error).message}</p>`),
        children: jsx(Boom, {}),
      }),
    );
    expect(html).toBe("<p>Error: [Boom] broken-part</p>");
  });

  it("silently passes normal children", async () => {
    const html = await renderToString(
      jsx(ErrorBoundary, {
        fallback: raw("<p>fail</p>"),
        children: raw("<span>ok</span>"),
      }),
    );
    expect(html).toBe("<span>ok</span>");
  });

  it("passes through when no children", async () => {
    const html = await renderToString(jsx(ErrorBoundary, { fallback: raw("<p>fail</p>") }));
    expect(html).toBe("");
  });

  it("throws TypeError when called directly outside jsx()", () => {
    expect(() => ErrorBoundary({ children: raw("test") })).toThrow(
      "[vincle/core] ErrorBoundary must be used within jsx(), not called directly.",
    );
  });
});

describe("Error annotation", () => {
  it("annotates sync error with component name", async () => {
    function Boom(): never {
      throw new Error("fail");
    }
    const orig = console.error;
    console.error = () => {};
    try {
      const html = await renderToString(
        jsx(ErrorBoundary, {
          fallback: (e: unknown) => raw(`<p>${(e as Error).message}</p>`),
          children: jsx(Boom, {}),
        }),
      );
      expect(html).toBe("<p>[Boom] fail</p>");
    } finally {
      console.error = orig;
    }
  });

  it("annotates a thrown string value", async () => {
    const Crash: () => never = () => {
      throw "string-boom" as never;
    };
    const orig = console.error;
    console.error = () => {};
    try {
      const html = await renderToString(
        jsx(ErrorBoundary, {
          fallback: (e: unknown) => raw(`<p>${(e as Error).message}</p>`),
          children: jsx(Crash, {}),
        }),
      );
      expect(html).toBe("<p>[Crash] string-boom</p>");
    } finally {
      console.error = orig;
    }
  });

  it("annotates a thrown number", async () => {
    const Crash: () => never = () => {
      throw 42 as never;
    };
    const orig = console.error;
    console.error = () => {};
    try {
      const html = await renderToString(
        jsx(ErrorBoundary, {
          fallback: (e: unknown) => raw(`<p>${(e as Error).message}</p>`),
          children: jsx(Crash, {}),
        }),
      );
      expect(html).toBe("<p>[Crash] 42</p>");
    } finally {
      console.error = orig;
    }
  });
});

describe("Context API", () => {
  const ReqId = context<number>("@vincle/test:req-id");

  it("setContext and useContext work inside a scope", async () => {
    const result = await withScope(async () => {
      setContext(ReqId, 42);
      return useContext(ReqId);
    });
    expect(result).toBe(42);
  });

  it("throws useContext when key not set in scope", async () => {
    await withScope(async () => {
      expect(() => useContext(ReqId)).toThrow("context not found");
    });
  });

  it("throws useContext outside any scope", () => {
    expect(() => useContext(ReqId)).toThrow("no active scope");
  });

  it("is isolated per concurrent scope (ALS)", async () => {
    const CtxA = context<number>("@vincle/test:a");
    const CtxB = context<number>("@vincle/test:b");

    const seedA = new Map([[CtxA, 10]]) as ContextMap;
    const seedB = new Map([[CtxB, 20]]) as ContextMap;

    function A() {
      setContext(CtxA, 99); // overrides the seeded 10
      return raw(`<span>${useContext(CtxA)}</span>`);
    }
    function B() {
      return raw(`<span>${useContext(CtxB)}</span>`);
    }

    // Build + render the JSX INSIDE each scope so the eager render runs within it.
    const results = await Promise.all([
      withScope(() => renderToString(jsx(A as any, {})), seedA),
      withScope(() => renderToString(jsx(B as any, {})), seedB),
    ]);

    expect(results).toEqual(["<span>99</span>", "<span>20</span>"]);
  });

  it("works without a scope when no context is used", async () => {
    const html = await renderToString(raw("<span>ok</span>"));
    expect(html).toBe("<span>ok</span>");
  });

  it("context(key) requires non-empty string", () => {
    expect(() => context("")).toThrow("non-empty string");
  });

  it("reads context through nested components", async () => {
    const Theme = context<string>("@vincle/test:theme");

    function Card() {
      const theme = useContext(Theme);
      return jsx("div", { class: `card-${theme}`, children: "content" });
    }

    const html = await withScope(
      () => renderToString(jsx(Card as any, {})),
      new Map([[Theme, "dark"]]) as ContextMap,
    );
    expect(html).toBe('<div class="card-dark">content</div>');
  });
});

describe("RenderError propagation", () => {
  it("propagates RenderError inside a synchronous array", async () => {
    function Boom(): never {
      throw new Error("sync-arr");
    }
    await expect(renderToString(jsx("div", { children: [jsx(Boom, {}), "ok"] }))).rejects.toThrow(
      "sync-arr",
    );
  });

  it("propagates RenderError in async array", async () => {
    async function AsyncBoom(): Promise<never> {
      await Promise.resolve();
      throw new Error("async-arr");
    }
    await expect(
      renderToString(jsx("div", { children: [Promise.resolve("a"), jsx(AsyncBoom, {})] })),
    ).rejects.toThrow("async-arr");
  });

  it("stops at first RenderError in sync array", async () => {
    const order: string[] = [];
    function Boom(): never {
      order.push("boom");
      throw new Error("x");
    }
    function Late(): string {
      order.push("late");
      return "y";
    }
    await expect(
      renderToString(jsx("div", { children: [jsx(Boom, {}), jsx(Late, {})] })),
    ).rejects.toThrow("x");
    // Both jsx() calls are eager, so both components execute.
    // RenderError propagation stops the *render* loop, not the jsx evaluation.
    expect(order).toEqual(["boom", "late"]);
  });
});

describe("Error annotation edge cases", () => {
  it("uses displayName for error annotation", async () => {
    const NamedComp = Object.assign(
      () => {
        throw new Error("fail");
      },
      { displayName: "MyDisplayName" },
    );
    try {
      await renderToString(jsx(NamedComp, {}));
      throw new Error("expected to throw");
    } catch (e) {
      expect((e as Error).message).toBe("[MyDisplayName] fail");
    }
  });

  it("handles frozen error objects without throwing", async () => {
    function Boom(): never {
      const e = new Error("fail");
      Object.freeze(e);
      throw e;
    }
    const html = await renderToString(
      jsx(ErrorBoundary, {
        fallback: () => raw("<p>ok</p>"),
        children: jsx(Boom, {}),
      }),
    );
    expect(html).toBe("<p>ok</p>");
  });

  it("handles non-extensible error objects", async () => {
    function Boom(): never {
      const e = new Error("fail");
      Object.preventExtensions(e);
      throw e;
    }
    const html = await renderToString(
      jsx(ErrorBoundary, {
        fallback: () => raw("<p>ok</p>"),
        children: jsx(Boom, {}),
      }),
    );
    expect(html).toBe("<p>ok</p>");
  });

  it("strips previous annotation prefix in re-annotation", async () => {
    function Child(): never {
      throw new Error("fail");
    }
    function Parent() {
      return jsx(Child, {});
    }
    try {
      await renderToString(jsx(Parent, {}));
    } catch (e) {
      expect((e as Error).message).toBe("[Child > Parent] fail");
      expect((e as Error).message).not.toContain("[Child > Parent] [Child");
    }
  });
});

describe("Edge cases", () => {
  it("handles deeply nested promises in array", async () => {
    const result = await renderToString([Promise.resolve(Promise.resolve("deep"))]);
    expect(result).toBe("deep");
  });
});

describe("Exported render()", () => {
  it("directly renders a string", () => {
    expect(render("hello")).toBe("hello");
  });

  it("directly renders RawString", () => {
    expect(render(raw("<b>ok</b>"))).toBe("<b>ok</b>");
  });

  it("wraps in scope when passed to renderToString", async () => {
    const html = await renderToString(jsx("span", { children: "ok" }));
    expect(html).toBe("<span>ok</span>");
  });
});
