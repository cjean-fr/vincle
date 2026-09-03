import { describe, expect, test } from "bun:test";

import { jsx, Fragment, VNode } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { raw } from "./types.js";

/**
 * Path-equivalence fuzzer — the structural guard for the hybrid model.
 *
 * The engine builds HTML two ways over the same value taxonomy: the eager fold
 * (`jsx` pre-renders static subtrees to a `RawString`) and the VNode tree walk
 * (`renderNode`). A "hole" is any value kind one path handles and the other
 * mishandles — silently, since the fallback is `escapeContent(String(v))`, not an
 * error. That's the class of bug an eager (single-path) renderer can't have.
 *
 * This test proves the two paths agree: a seeded generator builds the *same
 * logical tree* twice — once with `jsx` (fold on) and once with `vnodeOf` (the
 * VNode `jsx` returns when the fold bails, so every element stays a VNode) — and
 * asserts byte-identical output. Any divergence is a hole; the failing seed
 * reproduces it.
 */

type Builder = (tag: any, props: any) => unknown;

/**
 * The control: builds the same `VNode` `jsx` returns once the fold has bailed,
 * so every element takes the tree-walk path.
 *
 * Hand-written rather than derived — there is no "`jsx` minus the fold" to call.
 * It has to differ from `jsx` in exactly one way, the fold, or the comparison
 * stops meaning anything, so its `dangerouslySetInnerHTML` handling is kept
 * aligned with `jsx`'s by hand.
 */
function vnodeOf(tag: any, attributes: Record<string, unknown> | null): unknown {
  const props = attributes ?? {};
  const dsih = props["dangerouslySetInnerHTML"] as
    | { __html: string | null | undefined }
    | undefined;
  return new VNode(
    tag,
    props,
    dsih !== undefined ? trustedInnerHTML(dsih.__html) : props["children"],
  );
}

function trustedInnerHTML(html: unknown): unknown {
  if (typeof html === "string") return raw(html);
  if (html === null || html === undefined) return raw("");
  throw new TypeError(
    "[vincle/core] dangerouslySetInnerHTML.__html must be a string, got " + typeof html,
  );
}

// Seeded PRNG (mulberry32) — same seed ⇒ same sequence ⇒ same logical tree.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The seed window: `VINCLE_FUZZ_SEEDS` seeds after `VINCLE_FUZZ_OFFSET`.
 *
 * The default window is fixed, so a CI divergence replays from the failure
 * message alone; widening the sweep takes no edit. A malformed value is
 * refused, never clamped: a NaN count loops zero times, and a fuzzer that
 * checks nothing reports green.
 */
function seedWindow(count: number): number[] {
  const read = (name: string, fallback: number, min: number): number => {
    const value = process.env[name];
    if (value === undefined || value === "") return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min) {
      throw new Error(
        `[vincle fuzz] ${name} must be an integer >= ${min}, got ${JSON.stringify(value)}`,
      );
    }
    return n;
  };
  const offset = read("VINCLE_FUZZ_OFFSET", 0, 0);
  return Array.from({ length: read("VINCLE_FUZZ_SEEDS", count, 1) }, (_, i) => offset + i + 1);
}

const SEEDS = seedWindow(1000);

const TAGS = ["div", "span", "p", "section", "ul", "li", "a", "h1"];
const VOID = ["br", "img", "hr"];
const RAWTEXT = ["script", "style"];
// Texts covering every escapable char in both text and attribute context.
const TEXTS = [
  "hello world",
  "a & b < c > d",
  "\"quoted\" & 'apos'",
  "café ☕ résumé",
  "</script> injection & <div>",
  "1 < 2 && 3 > 0",
  "",
];

const pick = <T>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)]!;

function randProps(r: () => number): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (r() < 0.4) p["class"] = r() < 0.5 ? "foo bar" : ["a", r() < 0.5 ? "" : "b", "c"];
  if (r() < 0.3) p["id"] = "id" + Math.floor(r() * 100);
  if (r() < 0.25) p["title"] = pick(TEXTS, r);
  if (r() < 0.2) p["disabled"] = r() < 0.5;
  if (r() < 0.15) p["style"] = { color: "red", fontSize: 12 };
  if (r() < 0.1) p["data-x"] = Math.floor(r() * 10);
  // A `RawString` in an attribute is an object, and used to be read as a style bag
  // on this path only.
  if (r() < 0.08) p["style"] = raw("color:blue");
  // A promised attribute value: the fold now returns a `Promise<RawString>` for
  // these instead of declining, so this is the one prop shape where the two paths
  // do not even have the same *return type* — only the same bytes.
  if (r() < 0.12) p["href"] = Promise.resolve(r() < 0.5 ? "/p" : "javascript:alert(1)");
  // `__html` clears the children when it is nullish, and that is a second
  // branch: a string is trusted as markup, `null`/`undefined` render nothing.
  if (r() < 0.08)
    p["dangerouslySetInnerHTML"] = {
      __html: pick(["<b>raw</b> & stuff", "<i>late</i> & raw", null, undefined], r),
    };
  return p;
}

function genLeaf(r: () => number): unknown {
  const roll = r();
  if (roll < 0.43) return pick(TEXTS, r);
  if (roll < 0.57) return Math.floor(r() * 1000);
  if (roll < 0.69) return r() < 0.33 ? null : r() < 0.5 ? undefined : r() < 0.5;
  if (roll < 0.82) return raw("<em>" + pick(TEXTS, r) + "</em>");
  if (roll < 0.92) return BigInt(Math.floor(r() * 10000));
  // A function that is not a component — a child, not a tag. The fold declines
  // it (`typeof child === "function"`) and the walk stringifies it, so the two
  // agree only because the fold hands it over rather than folding `String(fn)`.
  if (roll < 0.96) return r() < 0.5 ? function named() {} : (): string => "x";
  return "";
}

/**
 * Does this element throw its children away?
 *
 * `dangerouslySetInnerHTML` replaces them, so children generated under one are
 * built and then dropped — and *built* is where the fold decides. A subtree the
 * fold refuses at construction (a void element carrying content, an invalid tag)
 * but the walk never renders has no single right answer: the eager path has
 * already seen it, the lazy path never will. That is a property of the two
 * models, not a hole between them, so the generator does not build such trees —
 * it would compare a construction-time refusal against a render that skipped the
 * offending node.
 */
function discardsChildren(props: Record<string, unknown>): boolean {
  return props["dangerouslySetInnerHTML"] !== undefined;
}

/** Build a child eagerly with `h`, consuming `r` at build time (never at render). */
function gen(h: Builder, r: () => number, depth: number): unknown {
  if (depth <= 0) return genLeaf(r);
  const roll = r();

  if (roll < 0.18) return genLeaf(r);

  if (roll < 0.28) {
    // component returning a single subtree
    const body = gen(h, r, depth - 1);
    return h(() => body, {});
  }

  if (roll < 0.36) {
    // component returning an ARRAY (the bug class fixed in point 1)
    const n = 1 + Math.floor(r() * 3);
    const items = Array.from({ length: n }, () => gen(h, r, depth - 1));
    return h(() => items, {});
  }

  if (roll < 0.42) {
    // Async component. The fold declines on it and renders the static siblings
    // anyway, so an async child is where a partly folded tree meets the walk —
    // the mix `precompile-equivalence.test.ts` generates and this one did not.
    const body = gen(h, r, depth - 1);
    return h(async () => body, {});
  }

  if (roll < 0.5) {
    // Fragment
    const n = 1 + Math.floor(r() * 3);
    const kids = Array.from({ length: n }, () => gen(h, r, depth - 1));
    return h(Fragment, { children: kids });
  }

  if (roll < 0.54) {
    // a raw (possibly nested) array passed directly as a child
    const n = 1 + Math.floor(r() * 3);
    return Array.from({ length: n }, () => gen(h, r, depth - 1));
  }

  if (roll < 0.58) {
    // A synchronous iterable that is not an array. `Renderable` has always
    // declared `Iterable<Renderable>`; the tree walk only started honouring it
    // once a `Set` was found rendering as "[object Set]".
    const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => gen(h, r, depth - 1));
    if (r() < 0.5) return new Set(items);
    return (function* () {
      for (const item of items) yield item;
    })();
  }

  if (roll < 0.62) {
    // Async iterable child. One-shot, which is why the two trees are built from
    // the seed twice instead of sharing one value.
    const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => gen(h, r, depth - 1));
    return (async function* () {
      for (const item of items) yield item;
    })();
  }

  if (roll < 0.66) {
    // Promise of a child, container included.
    return Promise.resolve(gen(h, r, depth - 1));
  }

  if (roll < 0.72) {
    // Void element — with children that render to nothing as often as without.
    //
    // Generating them childless only was how the fold and the tree-walk drifted
    // unnoticed: `serializeElement` used to decide void handling from a
    // `hasChildren` flag its two callers computed differently (`!!children` vs
    // `children !== undefined`), so every *falsy* child diverged. The children
    // below are exactly that shape, and the one a conditional child takes.
    //
    // Content inside a void element is refused by both paths, which is a
    // separate property with its own tests below: an arbitrary child here would
    // put two refusals in one tree, and the order they are found in is a
    // difference between eager construction and document-order rendering, not
    // between the two serializers.
    const props = randProps(r);
    if (!discardsChildren(props) && r() < 0.5) {
      props["children"] = pick(["", false, null, undefined, []], r);
    }
    return h(pick(VOID, r), props);
  }

  if (roll < 0.8) {
    // rawtext element (string child, may contain </script>)
    return h(pick(RAWTEXT, r), { children: pick(TEXTS, r) });
  }

  // regular element: single child or array of children
  const tag = pick(TAGS, r);
  const props = randProps(r);
  const nKids = Math.floor(r() * 4);
  if (!discardsChildren(props)) {
    props["children"] =
      nKids === 1
        ? gen(h, r, depth - 1)
        : Array.from({ length: nKids }, () => gen(h, r, depth - 1));
  }
  return h(tag, props);
}

/**
 * What a path *did*, as one comparable string: the HTML, or the refusal.
 *
 * The build is inside the try because the fold happens at `jsx()` time — a void
 * element carrying content is refused while the tree is being constructed, where
 * the tree walk refuses the same tree at render time. Comparing only successful
 * renders would let the two paths disagree on which trees are legal at all.
 */
async function outcome(build: () => unknown): Promise<string> {
  try {
    return `html:${await renderToString(build())}`;
  } catch (error) {
    return `refused:${bareMessage((error as Error).message)}`;
  }
}

/**
 * The refusal without its component annotation.
 *
 * `[Profile] …` is added when an error arrives as a *component's* rejection, and
 * the fold is what decides that shape: a promised attribute makes the folded
 * subtree a `Promise`, which the component then returns, where the walk returns a
 * `VNode` and the error surfaces outside the annotated call. That is a property
 * of the error path, not of the two serializers this test compares — the refusal
 * itself is what has to match.
 */
function bareMessage(message: string): string {
  const at = message.indexOf("[vincle/");
  return at === -1 ? message : message.slice(at);
}

describe("path equivalence: fold ≡ tree-walk", () => {
  test(`byte-identical output across ${SEEDS.length} random trees`, async () => {
    const failures: { seed: number; fold: string; treeWalk: string }[] = [];
    for (const seed of SEEDS) {
      const [fold, treeWalk] = await Promise.all([
        outcome(() => gen(jsx, mulberry32(seed), 5)),
        outcome(() => gen(vnodeOf, mulberry32(seed), 5)),
      ]);
      if (fold !== treeWalk) failures.push({ seed, fold, treeWalk });
    }
    if (failures.length > 0) {
      const f = failures[0]!;
      throw new Error(
        `${failures.length}/${SEEDS.length} trees diverged. First failing seed=${f.seed}\n` +
          `  fold:      ${JSON.stringify(f.fold)}\n` +
          `  tree-walk: ${JSON.stringify(f.treeWalk)}`,
      );
    }
    expect(failures.length).toBe(0);
  });
});

describe("a void element carrying children", () => {
  // TypeScript accepts `<br>{x}</br>` — `@types/react` does not forbid children
  // on a void tag — so this input is reachable, and it has no valid HTML form: a
  // parser drops the closing tag and reparents the content, turning `<br>x</br>`
  // into two breaks and a text node. Both paths refuse it, with one message.
  //
  // The falsy children matter as much as the refusal: they are the shape a
  // conditional child takes, and they must still render the bare element.
  test("content inside a void element is refused by the fold", () => {
    expect(() => jsx("br", { children: "x" })).toThrow(/<br> is a void element/);
  });

  test("…and by the tree walk, with the same message", async () => {
    const fold = await outcome(() => jsx("br", { children: "x" }));
    const walk = await outcome(() => jsx("br", { children: Promise.resolve("x") }));

    expect(fold).toStartWith("refused:");
    expect(walk).toBe(fold);
  });

  test("a child that renders to nothing is not content", async () => {
    for (const child of ["", false, null, undefined, [], [null, false]]) {
      expect(await renderToString(jsx("br", { children: child }))).toBe("<br>");
    }
    // `0` and `0n` are falsy but they are *text*, so they are content.
    for (const child of [0, 0n]) {
      expect(() => jsx("br", { children: child })).toThrow(/void element/);
    }
  });

  test("…and an element with no children is unaffected", async () => {
    expect(await renderToString(jsx("br", {}))).toBe("<br>");
  });
});
