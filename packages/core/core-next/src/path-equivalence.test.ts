import { describe, expect, test } from "bun:test";
import { jsx, Fragment, VNode } from "./jsx-runtime.js";
import { renderToString } from "./create-element.js";
import { raw } from "./raw.js";

/**
 * Path-equivalence fuzzer — the structural guard for the hybrid model.
 *
 * core-next has two renderers over the same value taxonomy: the eager fold
 * (`jsx` pre-renders static subtrees to RawString) and the VNode tree-walk
 * (`createElement`). A "hole" is any value kind one path handles and the other
 * mishandles — silently, since the fallback is `escapeHtml(String(v))`, not an
 * error. That's the class of bug an eager (single-path) renderer can't have.
 *
 * This test proves the two paths agree: a seeded generator builds the *same
 * logical tree* twice — once with `jsx` (fold on) and once with `nv` (`jsx`
 * with the fold branch removed, so every element stays a VNode) — and asserts
 * byte-identical output. Any divergence is a hole; the failing seed reproduces it.
 */

type Builder = (tag: any, props: any) => unknown;

/** `jsx` with the static-fold shortcut removed: always a VNode (tree-walk path). */
function nv(tag: any, attributes: Record<string, unknown> | null): unknown {
  const props = attributes ?? {};
  const p = props as { children?: unknown; dangerouslySetInnerHTML?: { __html?: unknown } };
  const finalChildren =
    p.dangerouslySetInnerHTML !== undefined
      ? raw(String(p.dangerouslySetInnerHTML.__html ?? ""))
      : p.children;
  return new VNode(tag, props, finalChildren);
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
  '"quoted" & \'apos\'',
  "café ☕ résumé",
  "</script> injection & <div>",
  "1 < 2 && 3 > 0",
  "",
];

const pick = <T,>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)]!;

function randProps(r: () => number): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (r() < 0.4) p["class"] = r() < 0.5 ? "foo bar" : ["a", r() < 0.5 ? "" : "b", "c"];
  if (r() < 0.3) p["id"] = "id" + Math.floor(r() * 100);
  if (r() < 0.25) p["title"] = pick(TEXTS, r);
  if (r() < 0.2) p["disabled"] = r() < 0.5;
  if (r() < 0.15) p["style"] = { color: "red", fontSize: 12 };
  if (r() < 0.1) p["data-x"] = Math.floor(r() * 10);
  if (r() < 0.08) p["dangerouslySetInnerHTML"] = { __html: "<b>raw</b> & stuff" };
  return p;
}

function genLeaf(r: () => number): unknown {
  const roll = r();
  if (roll < 0.45) return pick(TEXTS, r);
  if (roll < 0.6) return Math.floor(r() * 1000);
  if (roll < 0.72) return r() < 0.33 ? null : r() < 0.5 ? undefined : r() < 0.5 ? true : false;
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

  if (roll < 0.6) {
    // a raw (possibly nested) array passed directly as a child
    const n = 1 + Math.floor(r() * 3);
    return Array.from({ length: n }, () => gen(h, r, depth - 1));
  }

  if (roll < 0.68) {
    // void element (no children)
    return h(pick(VOID, r), randProps(r));
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
  test("byte-identical output across 1000 random trees", () => {
    const failures: { seed: number; fold: string; treeWalk: string }[] = [];
    for (let seed = 1; seed <= 1000; seed++) {
      const fold = renderToString(gen(jsx, mulberry32(seed), 5));
      const treeWalk = renderToString(gen(nv, mulberry32(seed), 5));
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
