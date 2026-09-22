import { describe, expect, test } from "bun:test";

import { jsx, jsxEscape, jsxTemplate } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { Scope } from "./scope.js";

/**
 * Components execute in document order.
 *
 * This is the engine's sequencing rule, and it is observable, so it is pinned
 * here rather than left to be inferred from the implementation.
 *
 * `renderToString` used to start every remaining sibling before awaiting any of
 * them, overlapping their I/O. The overlap was deliberate and it was free: right
 * up until a component mutated the context. Then the document depended on how long
 * each sibling took: a reader that awaited 1 ms saw the old value, the same reader
 * awaiting 20 ms saw the new one. Same tree, same code, two documents.
 *
 * The rule replaces all of that with something a developer can hold in their head:
 * **what runs before you in the document ran before you.** Overlapping I/O is
 * still available where it can be seen in the markup: `<Defer>` / `<Slot>` in
 * `@vincle/flow`.
 */

const KEY = Scope.key<string>("execution-order");
const later = <T>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const seedInitial = () => Scope.set(KEY, "initial");

describe("execution order is document order", () => {
  test("siblings run left to right, whatever they await", async () => {
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
    // The point: `fast:start` comes after `slow:end`. Under the previous overlap
    // it came first, and `fast` had finished before `slow` was even awaited.
    expect(calls).toEqual(["slow:start", "slow:end", "fast:start", "fast:end"]);
  });

  test("a sibling that rejects stops the ones after it", async () => {
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
    expect(reached).toBe(false);
  });
});

describe("setContext is visible to whatever renders after it", () => {
  const Writer = (value: string, ms: number) => async () => {
    await later(null, ms);
    Scope.set(KEY, value);
    return `w(${value})`;
  };
  const Reader = (ms: number) => async () => {
    await later(null, ms);
    return Scope.get(KEY);
  };

  test("a later sibling reads what an earlier one wrote", async () => {
    expect(
      await Scope.with(async () => {
        seedInitial();
        return renderToString(
          jsx("div", { children: [jsx(Writer("written", 5), {}), jsx(Reader(0), {})] }),
        );
      }),
    ).toBe("<div>w(written)written</div>");
  });

  // The regression that motivated the rule. Only the reader's latency changes.
  test("the document does not depend on how long anything takes", async () => {
    const results: string[] = [];
    for (const readerDelay of [0, 1, 5, 20]) {
      results.push(
        await Scope.with(async () => {
          seedInitial();
          return renderToString(
            jsx("div", {
              children: [jsx(Writer("written", 5), {}), jsx(Reader(readerDelay), {})],
            }),
          );
        }),
      );
    }
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("<div>w(written)written</div>");
  });

  test("an earlier sibling cannot see a later one's write", async () => {
    expect(
      await Scope.with(async () => {
        seedInitial();
        return renderToString(
          jsx("div", { children: [jsx(Reader(0), {}), jsx(Writer("written", 1), {})] }),
        );
      }),
    ).toBe("<div>initialw(written)</div>");
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
      await renderToString(jsx("p", { children: jsx(Writer("written", 1), {}) }));
      expect(await renderToString(jsx("p", { children: jsx(Reader(0), {}) }))).toBe(
        "<p>written</p>",
      );
    });
  });

  test("concurrent renders stay isolated from each other", async () => {
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
  describe(`${name}: sequential async tail`, () => {
    test("later components start after awaited context writes", async () => {
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
        return Scope.get(KEY);
      };
      const html = await Scope.with(() =>
        renderToString(
          build([
            "prefix",
            jsx(Writer("first"), {}),
            jsx(Writer("second"), {}),
            jsx(Reader, {}),
            "suffix",
          ]),
        ),
      );
      const tag = name === "rawtext tree walk" ? "script" : "p";
      expect(html).toBe(`<${tag}>prefixfirstsecondsecondsuffix</${tag}>`);
      expect(calls).toEqual(["first:start", "first:end", "second:start", "second:end", "read"]);
    });

    for (const inTail of [false, true]) {
      for (const asynchronous of [false, true]) {
        test(`${inTail ? "tail" : "first"} failure (${asynchronous ? "async" : "sync"}) stops later components`, async () => {
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
          await expect(renderToString(build(children))).rejects.toBe(error);
          expect(reached).toBe(false);
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
