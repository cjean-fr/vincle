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
 * logical tree* twice — once with `jsx` (fold on) and once with `vnodeOf` (`jsx`
 * with the fold branch removed, so every element stays a VNode) — and asserts
 * byte-identical output. Any divergence is a hole; the failing seed reproduces it.
 */

type Builder = (tag: any, props: any) => unknown;

/**
 * `jsx` with the static-fold shortcut removed: always a VNode (tree-walk path).
 *
 * Mirrors `jsx`'s handling of `dangerouslySetInnerHTML` — the control has to
 * differ from `jsx` in exactly one way, the fold, or the comparison stops
 * meaning anything.
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
  if (r() < 0.08)
    p["dangerouslySetInnerHTML"] = {
      __html: r() < 0.5 ? "<b>raw</b> & stuff" : "<i>late</i> & raw",
    };
  return p;
}

function genLeaf(r: () => number): unknown {
  const roll = r();
  if (roll < 0.45) return pick(TEXTS, r);
  if (roll < 0.6) return Math.floor(r() * 1000);
  if (roll < 0.72) return r() < 0.33 ? null : r() < 0.5 ? undefined : r() < 0.5;
  if (roll < 0.85) return raw("<em>" + pick(TEXTS, r) + "</em>");
  if (roll < 0.95) return BigInt(Math.floor(r() * 10000));
  return "";
}

/** Build a child eagerly with `h`, consuming `r` at build time (never at render). */
function gen(h: Builder, r: () => number, depth: number): unknown {
  if (depth <= 0) return genLeaf(r);
  const roll = r();

  if (roll < 0.2) return genLeaf(r);

  if (roll < 0.32) {
    // component returning a single subtree
    const body = gen(h, r, depth - 1);
    return h(() => body, {});
  }

  if (roll < 0.42) {
    // component returning an ARRAY (the bug class fixed in point 1)
    const n = 1 + Math.floor(r() * 3);
    const items = Array.from({ length: n }, () => gen(h, r, depth - 1));
    return h(() => items, {});
  }

  if (roll < 0.52) {
    // Fragment
    const n = 1 + Math.floor(r() * 3);
    const kids = Array.from({ length: n }, () => gen(h, r, depth - 1));
    return h(Fragment, { children: kids });
  }

  if (roll < 0.56) {
    // a raw (possibly nested) array passed directly as a child
    const n = 1 + Math.floor(r() * 3);
    return Array.from({ length: n }, () => gen(h, r, depth - 1));
  }

  if (roll < 0.6) {
    // A synchronous iterable that is not an array. `Renderable` has always
    // declared `Iterable<Renderable>`; the tree walk only started honouring it
    // once a `Set` was found rendering as "[object Set]".
    const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => gen(h, r, depth - 1));
    if (r() < 0.5) return new Set(items);
    return (function* () {
      for (const item of items) yield item;
    })();
  }

  if (roll < 0.68) {
    // Void element — with children as often as without.
    //
    // Generating them childless only was how the fold and the tree-walk drifted
    // unnoticed: `serializeElement` decides void handling from a `hasChildren`
    // flag, and the two callers computed it differently (`!!children` vs
    // `children !== undefined`), so every *falsy* child diverged —
    // `<img>{0}</img>` folded to `<img>` and walked to `<img>0</img>`.
    // The falsy leaves below are the ones that caught it.
    const props = randProps(r);
    const roll2 = r();
    if (roll2 < 0.25) {
      props["children"] = pick([0, "", false, null, undefined, 0n], r);
    } else if (roll2 < 0.5) {
      props["children"] = genLeaf(r);
    }
    return h(pick(VOID, r), props);
  }

  if (roll < 0.78) {
    // rawtext element (string child, may contain </script>)
    return h(pick(RAWTEXT, r), { children: pick(TEXTS, r) });
  }

  // regular element: single child or array of children
  const tag = pick(TAGS, r);
  const props = randProps(r);
  const nKids = Math.floor(r() * 4);
  props["children"] =
    nKids === 1 ? gen(h, r, depth - 1) : Array.from({ length: nKids }, () => gen(h, r, depth - 1));
  return h(tag, props);
}

describe("path equivalence: fold ≡ tree-walk", () => {
  test("byte-identical output across 1000 random trees", async () => {
    const failures: { seed: number; fold: string; treeWalk: string }[] = [];
    for (let seed = 1; seed <= 1000; seed++) {
      const [fold, treeWalk] = await Promise.all([
        renderToString(gen(jsx, mulberry32(seed), 5)),
        renderToString(gen(vnodeOf, mulberry32(seed), 5)),
      ]);
      if (fold !== treeWalk) failures.push({ seed, fold, treeWalk });
    }
    if (failures.length > 0) {
      const f = failures[0]!;
      throw new Error(
        `${failures.length}/1000 trees diverged. First failing seed=${f.seed}\n` +
          `  fold:      ${JSON.stringify(f.fold)}\n` +
          `  tree-walk: ${JSON.stringify(f.treeWalk)}`,
      );
    }
    expect(failures.length).toBe(0);
  });
});
