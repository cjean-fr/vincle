import { describe, expect, test } from "bun:test";

import { jsxEscape, jsxTemplate, jsx, Fragment } from "./jsx-runtime.js";
import { renderToString } from "./render.js";
import { raw, RawString, VNode } from "./types.js";

/**
 * Path-equivalence fuzzer for the **third** renderer.
 *
 * `path-equivalence.test.ts` proves the fold and the tree walk emit the same
 * bytes. It says nothing about the precompile runtime — `jsxEscape` /
 * `jsxTemplate`, the helpers the Deno/Bun-style transform calls — which is a
 * third traversal of the same value taxonomy, and was pinned only by a
 * hand-written case list.
 *
 * The list had a hole, and it was exactly the class the fold/walk fuzzer exists
 * to catch: a value kind one path handles and the other mishandles. An array of
 * VNodes rendered through `jsxEscape` and *threw* through `jsxTemplate`, because
 * the latter's synchronous path flattened arrays with `textValue`, which bottoms
 * out in `valueToText` — and `valueToText` refuses a VNode. `@vincle/vite-plugin-
 * precompile` wraps every hole in `jsxEscape`, so its own output never hit it;
 * but `jsxTemplate` is a public export, and GOAL wants the precompilation brick
 * to serve any runtime that exposes one.
 *
 * So the comparison here is per *value*, not per tree: for every shape a hole
 * can hold, the three ways to turn it into HTML must agree byte for byte.
 *
 * Values are regenerated from the seed for each path, never shared: a generator
 * and an async generator are consumed once, and handing the same one to three
 * renderers would measure exhaustion instead of equivalence.
 */

// Seeded PRNG (mulberry32) — same seed ⇒ same sequence ⇒ same logical value.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXTS = [
  "hello world",
  "a & b < c > d",
  "\"quoted\" & 'apos'",
  "café ☕ résumé",
  "</script> injection & <div>",
  "",
];

const pick = <T>(arr: readonly T[], r: () => number): T => arr[Math.floor(r() * arr.length)]!;

function genLeaf(r: () => number): unknown {
  const roll = r();
  if (roll < 0.3) return pick(TEXTS, r);
  if (roll < 0.45) return Math.floor(r() * 1000);
  if (roll < 0.55) return BigInt(Math.floor(r() * 10000));
  if (roll < 0.68) return r() < 0.33 ? null : r() < 0.5 ? undefined : r() < 0.5;
  if (roll < 0.8) return raw("<em>" + pick(TEXTS, r) + "</em>");
  // Objects with a `toString`: both taxonomies must fall through to String().
  // The text is drawn *now*, not inside `toString`. A leaf that draws from the
  // PRNG when stringified is not the same value twice, and the comparison then
  // measures how many times each path calls `String()` instead of what it
  // emits — which is a real difference: wrap a value in an element and the fold
  // stringifies a leaf before declining on a dynamic sibling, so the walk
  // stringifies it a second time. That is wasted work on a pure `toString` and
  // invisible; it made one seed in a thousand look like a renderer divergence.
  if (roll < 0.9) {
    const text = pick(TEXTS, r);
    return { toString: () => text };
  }
  return {};
}

/** Any value a precompile hole can hold, at bounded depth. */
function genValue(r: () => number, depth: number): unknown {
  if (depth <= 0) return genLeaf(r);
  const roll = r();

  if (roll < 0.24) return genLeaf(r);

  if (roll < 0.32) {
    // Element that cannot fold — a dynamic child keeps it a VNode.
    const child = genValue(r, depth - 1);
    return jsx("div", { class: pick(["a", "b c"], r), children: [child] });
  }

  if (roll < 0.4) {
    // Component returning a single subtree.
    const body = genValue(r, depth - 1);
    return jsx(() => body, {});
  }

  if (roll < 0.47) {
    // Component returning an array.
    const n = 1 + Math.floor(r() * 3);
    const items = Array.from({ length: n }, () => genValue(r, depth - 1));
    return jsx(() => items, {});
  }

  if (roll < 0.54) {
    // Async component — the shape GOAL calls the distinctive one.
    const body = genValue(r, depth - 1);
    return jsx(async () => body, {});
  }

  if (roll < 0.61) {
    const n = 1 + Math.floor(r() * 3);
    const kids = Array.from({ length: n }, () => genValue(r, depth - 1));
    return jsx(Fragment, { children: kids });
  }

  if (roll < 0.73) {
    // Array — possibly nested, possibly holding VNodes. The hole that was open.
    const n = Math.floor(r() * 4);
    return Array.from({ length: n }, () => genValue(r, depth - 1));
  }

  if (roll < 0.79) {
    // Non-array sync iterable.
    const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => genValue(r, depth - 1));
    if (r() < 0.5) return new Set(items);
    return (function* () {
      for (const item of items) yield item;
    })();
  }

  if (roll < 0.87) {
    const items = Array.from({ length: 1 + Math.floor(r() * 3) }, () => genValue(r, depth - 1));
    return (async function* () {
      for (const item of items) yield item;
    })();
  }

  // Promise of anything — including a promise of a container.
  return Promise.resolve(genValue(r, depth - 1));
}

// ── The three ways to turn one value into HTML ──────────────────────────────

const viaWalk = (v: unknown): Promise<string> => renderToString(v);

async function viaEscape(v: unknown): Promise<string> {
  const escaped = await jsxEscape(v);
  // `jsxEscape` lets a VNode through untouched by contract — the caller is the
  // rendez-vous that walks it. That is what a transform's generated code does.
  return escaped instanceof VNode ? renderToString(escaped) : escaped.value;
}

async function viaTemplate(v: unknown): Promise<string> {
  const out = await jsxTemplate(["", ""], v);
  return out.value;
}

// ── The same comparison, inside a rawtext element ───────────────────────────

/**
 * Why this needs its own block: the fuzzer above compares a value *in
 * isolation*, and `<script>` / `<style>` are the one context where the rule
 * changes.
 *
 * The regression that made it necessary: a hole inside rawtext was escaped for
 * HTML, so `a && b` came out `a &amp;&amp; b` — and an HTML parser never decodes
 * an entity in rawtext, so the JavaScript parser received those characters
 * literally. The tree walk had the rule, the fold was reconciled with it, and
 * the precompile path was the third renderer nobody had checked.
 *
 * There is no third copy of the rule any more, and that is what this block now
 * holds: the transform stops precompiling a rawtext element that has a dynamic
 * hole and emits the element itself as a template hole — an ordinary `jsx()`
 * call, the shape it already uses for components. So the rule stays where the
 * runtime keeps it, and the target runtime is whichever one the app compiles
 * against. The two forms below are the two sides of that: the same element,
 * rendered directly and rendered as a hole.
 */
const viaWalkRawtext = (v: unknown, tag: string): Promise<string> =>
  renderToString(jsx("div", { children: jsx(tag, { children: v }) }));

async function viaTemplateRawtext(v: unknown, tag: string): Promise<string> {
  const out = await jsxTemplate(["<div>", "</div>"], jsx(tag, { children: v }));
  return out.value;
}

describe("path equivalence: precompile ≡ tree-walk", () => {
  test("byte-identical output across 1000 random values", async () => {
    const failures: { seed: number; walk: string; escape: string; template: string }[] = [];

    for (let seed = 1; seed <= 1000; seed++) {
      // One fresh value per path: generators are single-use.
      const [walk, escape, template] = await Promise.all([
        viaWalk(genValue(mulberry32(seed), 4)),
        viaEscape(genValue(mulberry32(seed), 4)),
        viaTemplate(genValue(mulberry32(seed), 4)),
      ]);
      if (walk !== escape || walk !== template) {
        failures.push({ seed, walk, escape, template });
      }
    }

    if (failures.length > 0) {
      const f = failures[0]!;
      throw new Error(
        `${failures.length}/1000 values diverged. First failing seed=${f.seed}\n` +
          `  tree-walk:   ${JSON.stringify(f.walk)}\n` +
          `  jsxEscape:   ${JSON.stringify(f.escape)}\n` +
          `  jsxTemplate: ${JSON.stringify(f.template)}`,
      );
    }
    expect(failures.length).toBe(0);
  });

  test.each(["script", "style"])(
    "byte-identical inside <%s> across 1000 random values",
    async (tag) => {
      const failures: { seed: number; walk: string; template: string }[] = [];

      for (let seed = 1; seed <= 1000; seed++) {
        const [walk, template] = await Promise.all([
          viaWalkRawtext(genValue(mulberry32(seed), 4), tag),
          viaTemplateRawtext(genValue(mulberry32(seed), 4), tag),
        ]);
        if (walk !== template) failures.push({ seed, walk, template });
      }

      if (failures.length > 0) {
        const f = failures[0]!;
        throw new Error(
          `${failures.length}/1000 values diverged inside <${tag}>. First failing seed=${f.seed}\n` +
            `  tree-walk:          ${JSON.stringify(f.walk)}\n` +
            `  jsxTemplate hole:   ${JSON.stringify(f.template)}`,
        );
      }
      expect(failures.length).toBe(0);
    },
  );

  test("a hole in rawtext is not escaped for HTML", async () => {
    // The regression itself, spelled out: these are the bytes that broke.
    expect(await viaTemplateRawtext("if (a && b < c) {}", "script")).toBe(
      "<div><script>if (a && b < c) {}</script></div>",
    );
    expect(await viaTemplateRawtext("a > b", "style")).toBe("<div><style>a > b</style></div>");
  });

  test("…but the closing tag is still neutralized", async () => {
    const out = await viaTemplateRawtext("x = '</script><img onerror=alert(1)>'", "script");
    expect(out).not.toContain("</script><img");
    expect(await viaWalkRawtext("x = '</script><img onerror=alert(1)>'", "script")).toBe(out);
  });

  test("an array of VNodes renders the same through every path", async () => {
    const build = (): unknown[] => [
      jsx(() => jsx("b", { children: "one" }), {}),
      jsx(async () => jsx("i", { children: "two" }), {}),
    ];

    const expected = "<b>one</b><i>two</i>";
    expect(await viaWalk(build())).toBe(expected);
    expect(await viaEscape(build())).toBe(expected);
    expect(await viaTemplate(build())).toBe(expected);
  });

  test("jsxTemplate interleaves its static fragments around every hole shape", async () => {
    const out = await jsxTemplate(
      ["<ul>", "|", "</ul>"],
      [jsx(() => jsx("li", { children: "a" }), {})],
      new Set(["x", "y"]),
    );
    expect(out.value).toBe("<ul><li>a</li>|xy</ul>");
  });

  test("a RawString hole is not escaped twice", async () => {
    const v = raw("<b>&amp;</b>");
    expect(await viaWalk(v)).toBe("<b>&amp;</b>");
    expect(await viaEscape(v)).toBe("<b>&amp;</b>");
    expect(await viaTemplate(v)).toBe("<b>&amp;</b>");
    expect(jsxEscape(v)).toBeInstanceOf(RawString);
  });
});
