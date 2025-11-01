import { describe, expect, test } from "bun:test";

import { context, setContext, useContext, withScope } from "./context.js";
import { jsx } from "./jsx-runtime.js";
import { renderToString } from "./render.js";

/**
 * Components execute in document order.
 *
 * This is the engine's sequencing rule, and it is observable, so it is pinned
 * here rather than left to be inferred from the implementation.
 *
 * `renderToString` used to start every remaining sibling before awaiting any of
 * them, overlapping their I/O. The overlap was deliberate and it was free — right
 * up until a component mutated the context. Then the document depended on how long
 * each sibling took: a reader that awaited 1 ms saw the old value, the same reader
 * awaiting 20 ms saw the new one. Same tree, same code, two documents.
 *
 * The rule replaces all of that with something a developer can hold in their head:
 * **what runs before you in the document ran before you.** Overlapping I/O is
 * still available where it can be seen in the markup — `<Template>` / `<Slot>` in
 * `@vincle/flow`.
 */

const KEY = context<string>("execution-order");
const later = <T>(value: T, ms: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const seedInitial = () => setContext(KEY, "initial");

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
    setContext(KEY, value);
    return `w(${value})`;
  };
  const Reader = (ms: number) => async () => {
    await later(null, ms);
    return useContext(KEY);
  };

  test("a later sibling reads what an earlier one wrote", async () => {
    expect(
      await withScope(async () => {
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
        await withScope(async () => {
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
      await withScope(async () => {
        seedInitial();
        return renderToString(
          jsx("div", { children: [jsx(Reader(0), {}), jsx(Writer("written", 1), {})] }),
        );
      }),
    ).toBe("<div>initialw(written)</div>");
  });

  test("a parent's write reaches its own children", async () => {
    const Child = () => useContext(KEY);
    const Parent = async () => {
      await later(null, 1);
      setContext(KEY, "from-parent");
      return jsx("span", { children: jsx(Child, {}) });
    };
    expect(
      await withScope(async () => {
        seedInitial();
        return renderToString(jsx("div", { children: jsx(Parent, {}) }));
      }),
    ).toBe("<div><span>from-parent</span></div>");
  });

  // A scope is one execution stack, not one render: a write is still there for
  // the next render in the same `withScope`. That is what makes `withScope` the
  // per-request boundary, and why the helper above seeds each render separately.
  test("a write outlives the render that made it, within its scope", async () => {
    await withScope(async () => {
      setContext(KEY, "initial");
      await renderToString(jsx("p", { children: jsx(Writer("written", 1), {}) }));
      expect(await renderToString(jsx("p", { children: jsx(Reader(0), {}) }))).toBe(
        "<p>written</p>",
      );
    });
  });

  test("concurrent renders stay isolated from each other", async () => {
    const render = (value: string) =>
      withScope(async () => {
        setContext(KEY, value);
        return renderToString(jsx("p", { children: jsx(Reader(value.length), {}) }));
      });
    expect(await Promise.all([render("aaa"), render("bb"), render("c")])).toEqual([
      "<p>aaa</p>",
      "<p>bb</p>",
      "<p>c</p>",
    ]);
  });
});
