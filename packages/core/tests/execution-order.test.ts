import { describe, expect, test } from "bun:test";

import { jsx, jsxEscape, jsxTemplate } from "../src/jsx-runtime.js";
import { renderToString } from "../src/render.js";
import { Scope } from "../src/scope.js";

/**
 * Siblings render concurrently; output stays in document order.
 *
 * The engine starts children left to right. As long as every child is
 * synchronous that is the whole story. The first time a child suspends, every
 * remaining sibling starts as well, and their asynchronous work overlaps.
 * Whatever the completion order, the emitted document keeps the document
 * order: a slow first sibling never pushes a fast second one out of place.
 *
 * Scope is shared by the whole render and the engine does not arbitrate it:
 * a write made before a component's first await is visible to every sibling
 * (their synchronous prefixes run in document order); a write made after an
 * await races with the other siblings' continuations, so which reader sees
 * which value depends on timing. Cross-sibling communication that must be
 * deterministic goes through markup (`<Defer>` / `<Slot>` in `@vincle/flow`),
 * not through awaited Scope writes.
 */

const KEY = Scope.key<string>("execution-order");
const later = <T>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const seedInitial = () => Scope.set(KEY, "initial");

describe("siblings start left to right, then overlap", () => {
  test("a slow first sibling does not delay a fast second one", async () => {
    const calls: string[] = [];
    const Slow = () => {
      calls.push("slow:start");
      return later("slow", 20).then((v) => {
        calls.push("slow:end");
        return v;
      });
    };
    const Fast = () => {
      calls.push("fast:start");
      return later("fast", 1).then((v) => {
        calls.push("fast:end");
        return v;
      });
    };

    expect(await renderToString(jsx("p", { children: [jsx(Slow, {}), jsx(Fast, {})] }))).toBe(
      "<p>slowfast</p>",
    );
    // Both start in document order; the fast one finishes first; the document
    // still reads slow then fast.
    expect(calls).toEqual(["slow:start", "fast:start", "fast:end", "slow:end"]);
  });

  test("a synchronous component throw does not stop later siblings either", async () => {
    let reached = false;
    const Boom = () => {
      throw new Error("boom");
    };
    const After = () => {
      reached = true;
      return "after";
    };
    await expect(
      renderToString(jsx("p", { children: [jsx(Boom, {}), jsx(After, {})] })),
    ).rejects.toThrow("boom");
    // `renderNode` normalizes a component's synchronous throw to a rejection,
    // so from the sibling list it is indistinguishable from an async failure:
    // the remaining siblings still start, and the failure still surfaces.
    expect(reached).toBe(true);
  });

  test("an asynchronous failure does not stop later siblings", async () => {
    let reached = false;
    const Boom = async () => {
      throw new Error("boom");
    };
    const After = () => {
      reached = true;
      return "after";
    };
    await expect(
      renderToString(jsx("p", { children: [jsx(Boom, {}), jsx(After, {})] })),
    ).rejects.toThrow("boom");
    // Boom suspended, After started: sibling work already in flight is not
    // cancelled. The rejection still surfaces.
    expect(reached).toBe(true);
  });

  test("the first failure in document order surfaces, whatever the timing", async () => {
    const LatePositionEarlyFailure = () =>
      later("x", 1).then(() => Promise.reject(new Error("second-in-doc")));
    const EarlyPositionLateFailure = () =>
      later("x", 20).then(() => Promise.reject(new Error("first-in-doc")));
    await expect(
      renderToString(
        jsx("p", {
          children: [jsx(EarlyPositionLateFailure, {}), jsx(LatePositionEarlyFailure, {})],
        }),
      ),
    ).rejects.toThrow("first-in-doc");
  });
});

describe("Scope is shared; the engine does not arbitrate sibling writes", () => {
  test("a write before the first await is visible to later siblings", async () => {
    const Writer = () => {
      Scope.set(KEY, "written");
      return later("w(written)", 5);
    };
    const Reader = () => Scope.get(KEY);
    expect(
      await Scope.with(async () => {
        seedInitial();
        return renderToString(jsx("div", { children: [jsx(Writer, {}), jsx(Reader, {})] }));
      }),
    ).toBe("<div>w(written)written</div>");
  });

  // The counterpart of the guarantee above: once a writer awaits, its write
  // races with the other siblings' continuations. Core makes no promise here;
  // the document legitimately depends on timing. Both outcomes are pinned so
  // the contract stays honest rather than silently timing-dependent.
  test("an awaited write races with sibling readers", async () => {
    const Writer = async () => {
      await later(null, 5);
      Scope.set(KEY, "written");
      return "w";
    };
    const Reader = (ms: number) => async () => {
      await later(null, ms);
      return Scope.get(KEY);
    };
    const renderWith = (readerDelay: number) =>
      Scope.with(async () => {
        seedInitial();
        return renderToString(
          jsx("div", { children: [jsx(Writer, {}), jsx(Reader(readerDelay), {})] }),
        );
      });
    expect(await renderWith(0)).toBe("<div>winitial</div>");
    expect(await renderWith(50)).toBe("<div>wwritten</div>");
  });

  test("a parent's write reaches its own children", async () => {
    const Child = () => Scope.get(KEY);
    const Parent = async () => {
      await later(null, 1);
      Scope.set(KEY, "from-parent");
      return jsx("span", { children: jsx(Child, {}) });
    };
    expect(
      await Scope.with(async () => {
        seedInitial();
        return renderToString(jsx("div", { children: jsx(Parent, {}) }));
      }),
    ).toBe("<div><span>from-parent</span></div>");
  });

  // A scope is one execution stack, not one render: a write is still there for
  // the next render in the same `Scope.with`. That is what makes `Scope.with` the
  // per-request boundary, and why the helper above seeds each render separately.
  test("a write outlives the render that made it, within its scope", async () => {
    await Scope.with(async () => {
      Scope.set(KEY, "initial");
      const Writer = async () => {
        await later(null, 1);
        Scope.set(KEY, "written");
        return "w";
      };
      const Reader = () => Scope.get(KEY);
      await renderToString(jsx("p", { children: jsx(Writer, {}) }));
      expect(await renderToString(jsx("p", { children: jsx(Reader, {}) }))).toBe("<p>written</p>");
    });
  });

  test("concurrent renders stay isolated from each other", async () => {
    const Reader = (ms: number) => async () => {
      await later(null, ms);
      return Scope.get(KEY);
    };
    const render = (value: string) =>
      Scope.with(async () => {
        Scope.set(KEY, value);
        return renderToString(jsx("p", { children: jsx(Reader(value.length), {}) }));
      });
    expect(await Promise.all([render("aaa"), render("bb"), render("c")])).toEqual([
      "<p>aaa</p>",
      "<p>bb</p>",
      "<p>c</p>",
    ]);
  });
});

const orderedPaths: [string, (children: unknown[]) => unknown][] = [
  ["tree walk", (children) => jsx("p", { children })],
  [
    "precompiled holes",
    (children) => jsxTemplate(["<p>", ...children.slice(1).map(() => ""), "</p>"], ...children),
  ],
  ["precompiled array", (children) => jsxTemplate(["<p>", "</p>"], jsxEscape(children))],
  ["rawtext tree walk", (children) => jsx("script", { children })],
];

for (const [name, build] of orderedPaths) {
  describe(`${name}: concurrent async tail`, () => {
    test("every sibling starts once one suspends; output keeps document order", async () => {
      const calls: string[] = [];
      const Writer = (value: string) => async () => {
        calls.push(`${value}:start`);
        await Promise.resolve();
        Scope.set(KEY, value);
        calls.push(`${value}:end`);
        return value;
      };
      const Reader = () => {
        calls.push("read");
        return Scope.get(KEY) ?? "unset";
      };
      const html = await Scope.with(() => {
        seedInitial();
        return renderToString(
          build([
            "prefix",
            jsx(Writer("first"), {}),
            jsx(Writer("second"), {}),
            jsx(Reader, {}),
            "suffix",
          ]),
        );
      });
      const tag = name === "rawtext tree walk" ? "script" : "p";
      // Starts stay in document order; the reader runs before either awaited
      // write lands, so it sees the seed; the output never reorders.
      expect(calls).toEqual(["first:start", "second:start", "read", "first:end", "second:end"]);
      expect(html).toBe(`<${tag}>prefixfirstsecondinitialsuffix</${tag}>`);
    });

    for (const inTail of [false, true]) {
      for (const asynchronous of [false, true]) {
        test(`${inTail ? "tail" : "first"} failure (${asynchronous ? "async" : "sync"}) does not stop later components`, async () => {
          let reached = false;
          const error = new Error("stop");
          const Boom = () => {
            if (asynchronous) return Promise.reject(error);
            throw error;
          };
          const After = () => {
            reached = true;
            return "after";
          };
          const children = [jsx(Boom, {}), jsx(After, {})];
          if (inTail) children.unshift(jsx(async () => "first", {}));
          // Component failures always arrive as rejections (`renderNode`
          // normalizes the synchronous throw), so siblings always overlap and
          // in-flight work completes; the rejection still surfaces.
          await expect(renderToString(build(children))).rejects.toBe(error);
          expect(reached).toBe(true);
        });
      }
    }
  });
}

test("precompiled async tails remove only absent attribute separators", async () => {
  expect(
    await renderToString(
      jsxTemplate(["<input ", " ", " ", ">"], Promise.resolve(null), null, Promise.resolve(null)),
    ),
  ).toBe("<input>");
  expect(
    await renderToString(
      jsxTemplate(
        ['<div title="a ', " ", '">a ', " b</div>"],
        Promise.resolve(null),
        null,
        Promise.resolve(null),
      ),
    ),
  ).toBe('<div title="a  ">a  b</div>');
});
