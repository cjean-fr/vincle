import { describe, expect, test } from "bun:test";

import { renderToString } from "./create-element-async.js";
import { Fragment, jsx, VNode } from "./jsx-runtime.js";
import { raw } from "./raw.js";
import { renderToChunks } from "./render-chunks.js";

async function collect(node: unknown): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of renderToChunks(node)) chunks.push(chunk);
  return chunks;
}

const render = async (node: unknown): Promise<string> => (await collect(node)).join("");

const defer = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), 0));

describe("renderToChunks — output equivalence", () => {
  test("a synchronous tree renders exactly as renderToString does", async () => {
    const tree = jsx("div", {
      class: "card",
      children: [jsx("h1", { children: "Title" }), jsx("p", { children: "a & b < c" })],
    });
    expect(await render(tree)).toBe(await renderToString(tree));
  });

  test("void elements, rawtext and raw() agree with renderToString", async () => {
    const build = () =>
      jsx("section", {
        children: [
          jsx("br", {}),
          jsx("img", { src: "/a.png", alt: "x & y" }),
          jsx("script", { children: "if (a </script> b) {}" }),
          jsx("style", { children: "a { content: '<'; }" }),
          raw("<em>trusted</em>"),
        ],
      });
    expect(await render(build())).toBe(await renderToString(build()));
  });

  test("async components resolve to the same bytes", async () => {
    const Slow = async () => jsx("span", { children: await defer("done") });
    const build = () => jsx("div", { children: [jsx(Slow, {}), "tail"] });
    expect(await render(build())).toBe(await renderToString(build()));
  });
});

describe("renderToChunks — chunk boundaries are suspension points", () => {
  test("a synchronous tree yields exactly one chunk", async () => {
    const tree = jsx("ul", {
      children: [jsx("li", { children: "a" }), jsx("li", { children: "b" })],
    });
    expect(await collect(tree)).toEqual(["<ul><li>a</li><li>b</li></ul>"]);
  });

  test("everything before an async component is flushed before it is awaited", async () => {
    const Slow = async () => await defer("late");
    const chunks = await collect(
      jsx("div", { children: [jsx("header", { children: "early" }), jsx(Slow, {}), "tail"] }),
    );
    expect(chunks[0]).toBe("<div><header>early</header>");
    expect(chunks.join("")).toBe("<div><header>early</header>latetail</div>");
  });

  test("the shell reaches the client before a slow component settles", async () => {
    let released!: () => void;
    const gate = new Promise<void>((resolve) => {
      released = resolve;
    });
    const Blocked = async () => {
      await gate;
      return "body";
    };

    const iterator = renderToChunks(
      jsx("html", {
        children: [jsx("head", { children: jsx("title", { children: "T" }) }), jsx(Blocked, {})],
      }),
    );

    // The head is available while `Blocked` is still parked — the entire point.
    const first = await iterator.next();
    expect(first.value).toBe("<html><head><title>T</title></head>");

    released();
    const rest: string[] = [];
    for await (const chunk of iterator) rest.push(chunk);
    expect(rest.join("")).toBe("body</html>");
  });

  test("each pull of an async iterable is preceded by a flush", async () => {
    async function* ticker() {
      yield jsx("li", { children: "1" });
      await defer(null);
      yield jsx("li", { children: "2" });
    }
    // Pulling an iterator may block, so the open tag ships before the first
    // `next()` — we cannot know it will resolve synchronously, and guessing
    // wrong would hold bytes back.
    expect(await collect(jsx("ul", { children: ticker() }))).toEqual([
      "<ul>",
      "<li>1</li>",
      "<li>2</li>",
      "</ul>",
    ]);
  });

  test("an empty tree yields no chunk at all", async () => {
    expect(await collect(null)).toEqual([]);
    expect(await collect([undefined, false, ""])).toEqual([]);
  });
});

describe("renderToChunks — failure modes", () => {
  test("an invalid tag name throws, naming the package and the tag", async () => {
    expect(render(new VNode("bad tag", {}, undefined))).rejects.toThrow(
      /\[vincle\/core\] Invalid tag name "bad tag"/,
    );
  });

  test("a rejected component propagates to the consumer", async () => {
    const Boom = async () => {
      throw new Error("component failed");
    };
    expect(render(jsx("div", { children: jsx(Boom, {}) }))).rejects.toThrow("component failed");
  });

  test("abandoning the stream closes the async iterable it was draining", async () => {
    let closed = false;
    async function* infinite() {
      try {
        for (;;) {
          yield jsx("li", { children: "x" });
          await defer(null);
        }
      } finally {
        closed = true;
      }
    }

    const iterator = renderToChunks(jsx("ul", { children: infinite() }));
    await iterator.next(); // "<ul>" — flushed before the first pull
    await iterator.next(); // "<li>x</li>" — the generator body is now running
    await iterator.return(undefined);
    expect(closed).toBe(true);
  });
});

/**
 * Differential fuzz — the real guard.
 *
 * `renderToChunks` duplicates the tree walk of `renderToString`; unit tests can
 * only cover the branches someone thought to write down. This drives both over
 * the same 500 generated trees, including async nodes, and asserts the joined
 * chunks are byte-identical. A divergence prints the failing seed.
 */
describe("renderToChunks ≡ renderToString", () => {
  function mulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TAGS = ["div", "span", "p", "section", "ul", "li"];
  const VOID = ["br", "img", "hr"];
  const RAWTEXT = ["script", "style"];
  const TEXTS = [
    "hello world",
    "a & b < c > d",
    "\"quoted\" & 'apos'",
    "café ☕",
    "</script> injection & <div>",
    "",
  ];

  const pick = <T>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)]!;

  function genLeaf(r: () => number): unknown {
    const roll = r();
    if (roll < 0.4) return pick(TEXTS, r);
    if (roll < 0.55) return Math.floor(r() * 1000);
    if (roll < 0.68) return r() < 0.33 ? null : r() < 0.5 ? undefined : r() < 0.5;
    if (roll < 0.8) return raw("<em>" + pick(TEXTS, r) + "</em>");
    if (roll < 0.9) return BigInt(Math.floor(r() * 10000));
    return "";
  }

  function randProps(r: () => number): Record<string, unknown> {
    const p: Record<string, unknown> = {};
    if (r() < 0.4) p["className"] = "foo bar";
    if (r() < 0.3) p["id"] = "id" + Math.floor(r() * 100);
    if (r() < 0.25) p["title"] = pick(TEXTS, r);
    if (r() < 0.15) p["style"] = { color: "red", fontSize: 12 };
    return p;
  }

  function gen(r: () => number, depth: number): unknown {
    if (depth <= 0) return genLeaf(r);
    const roll = r();

    if (roll < 0.18) return genLeaf(r);

    if (roll < 0.28) {
      // async component — the branch that makes the two paths differ at all
      const body = gen(r, depth - 1);
      return jsx(async () => (await defer(null), body), {});
    }
    if (roll < 0.34) {
      // a bare promise as a child
      return defer(gen(r, depth - 1));
    }
    if (roll < 0.42) {
      // async iterable child
      const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => gen(r, depth - 1));
      return (async function* () {
        for (const item of items) {
          await defer(null);
          yield item;
        }
      })();
    }
    if (roll < 0.5) {
      const body = gen(r, depth - 1);
      return jsx(() => body, {});
    }
    if (roll < 0.58) {
      const kids = Array.from({ length: 1 + Math.floor(r() * 3) }, () => gen(r, depth - 1));
      return jsx(Fragment, { children: kids });
    }
    if (roll < 0.66) {
      return Array.from({ length: 1 + Math.floor(r() * 3) }, () => gen(r, depth - 1));
    }
    if (roll < 0.74) return jsx(pick(VOID, r), randProps(r));
    if (roll < 0.82) return jsx(pick(RAWTEXT, r), { children: pick(TEXTS, r) });

    const props = randProps(r);
    const nKids = Math.floor(r() * 4);
    props["children"] =
      nKids === 1 ? gen(r, depth - 1) : Array.from({ length: nKids }, () => gen(r, depth - 1));
    return jsx(pick(TAGS, r), props);
  }

  test("byte-identical output across 500 random async trees", async () => {
    for (let seed = 1; seed <= 500; seed++) {
      const expected = await renderToString(gen(mulberry32(seed), 4));
      const actual = await render(gen(mulberry32(seed), 4));
      if (actual !== expected) {
        throw new Error(
          `Divergence at seed=${seed}\n` +
            `  renderToString: ${JSON.stringify(expected)}\n` +
            `  renderToChunks: ${JSON.stringify(actual)}`,
        );
      }
    }
  });
});
