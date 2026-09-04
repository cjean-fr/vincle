import type { Renderable } from "./types.js";

import { serializeAttr } from "./attrs.js";
import { isAsyncIterable, isIterable, valueToText } from "./escape.js";
import { collectAsyncIterable, renderNode, sequenceFrom } from "./render.js";
import { tryRenderStatic } from "./serialize.js";
import { VNode, raw, RawString } from "./types.js";

// ── jsx — hybrid: single-pass fold of static trees, VNode for dynamic ─────

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode | RawString | Promise<RawString> {
  const props = attributes ?? {};
  // Read first, `hasOwn` only if the read finds something: an absent
  // `dangerouslySetInnerHTML` — every element but a handful — costs one
  // property miss, as it did before the guard existed. It is the one prop worth
  // guarding: it bypasses the escaping chain, and an `Object.prototype` gadget
  // for it is plain JSON. A polluted `children` reaches the document escaped.
  const dsihValue = props["dangerouslySetInnerHTML"];
  const dsih = (
    dsihValue !== undefined && Object.hasOwn(props, "dangerouslySetInnerHTML")
      ? dsihValue
      : undefined
  ) as { __html: string | null | undefined } | undefined;

  // Validated by whichever exit takes over: `tryRenderStatic` when the element
  // folds, the `VNode` constructor when it does not.
  if (typeof tag === "string" && dsih === undefined) {
    const folded = tryRenderStatic(tag, props);
    if (folded !== null) return folded;
  }

  // `dangerouslySetInnerHTML` is trusted HTML — `raw` keeps it unescaped.
  let children = props["children"];
  if (children !== undefined && "children" in Object.prototype && !Object.hasOwn(props, "children"))
    children = undefined;
  if (dsih !== undefined) {
    const html = dsih.__html;
    if (typeof html === "string") children = raw(html);
    else if (html === null || html === undefined) children = raw("");
    else
      throw new TypeError(
        `[vincle/core] dangerouslySetInnerHTML.__html must be a string (or null/undefined to clear), got ${typeof html}. ` +
          'Pass markup as a string: { __html: "<b>hi</b>" }.',
      );
  }

  return new VNode(tag, props, children);
}

const jsxs = jsx;

function Fragment({ children }: { children?: Renderable }): Renderable {
  return children;
}

// ── Precompile runtime helpers ────────────────────────────────────────────
//
// jsxEscape, jsxAttr, and jsxTemplate support the Deno/Bun-style JSX
// precompile transform (`jsxImportSource: "precompile"`). They handle the
// per-value encoding that the transform delegates to the runtime.

/**
 * Escape a value for insertion into a JSX template literal.
 *
 * Follows the Deno/Preact precompile contract: a `VNode` passes through
 * untouched — the renderer (`jsxTemplate`, or the tree walk for a fragment
 * result) is the rendez-vous that turns it into HTML. Stringifying it here
 * would emit `[object Object]` instead of the component's markup.
 *
 * Returns either a `RawString` (synchronous case), a `Promise<RawString>`
 * (when the value contains promises or async iterables), or a `VNode`.
 */
export function jsxEscape(v: unknown): RawString | VNode | Promise<RawString | VNode> {
  if (v instanceof RawString) return v;
  if (v instanceof Promise) return v.then((resolved) => jsxEscape(resolved));
  if (Array.isArray(v)) return escapeArray(v);
  if (v != null && typeof v !== "string") {
    const anyV = v as { [Symbol.iterator]?: unknown; [Symbol.asyncIterator]?: unknown };
    if (v instanceof VNode) return v;
    if (typeof anyV[Symbol.asyncIterator] === "function") {
      return collectAsyncIterable(v as AsyncIterable<unknown>, renderValue).then(
        (s) => new RawString(s),
      );
    }
    if (typeof anyV[Symbol.iterator] === "function") {
      return escapeArray(Array.from(v as Iterable<unknown>));
    }
  }
  return new RawString(valueToText(v));
}

// Single pass, matching `renderChildrenAsync` in `render.ts`: a three-pass form
// (`map`, then `some`, then concatenate) is several times slower on the
// all-synchronous case that's the norm here.
function escapeArray(arr: unknown[]): RawString | Promise<RawString> {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const part = jsxEscape(arr[i]);
    if (part instanceof Promise) {
      // Document order, never `Promise.all` — same sequencing rule as
      // `render.ts`. Reduced to final text here so `escapeArrayFrom` gets the
      // same type from both call sites (see its `pending` note).
      return escapeArrayFrom(out, part.then(renderEscaped), arr, i + 1);
    }
    if (part instanceof VNode) {
      const rendered = renderNode(part);
      if (rendered instanceof Promise) {
        return escapeArrayFrom(out, rendered, arr, i + 1);
      }
      out += rendered;
      continue;
    }
    out += part.value;
  }
  return new RawString(out);
}

/**
 * Finish an array whose `from - 1`-th element suspended.
 *
 * `pending` resolves to **final text**, and the two call sites are what makes
 * that worth stating: one holds a `Promise<RawString | VNode>`, the other a
 * `Promise<string>` the tree walk has already rendered. Both must arrive here
 * rendered. A value still to be rendered goes back through the leaf taxonomy,
 * where `escapeContent` runs over finished markup — an async component inside
 * an array then comes out as `&lt;i&gt;two&lt;/i&gt;` on the precompile path
 * and `<i>two</i>` on every other one.
 *
 * Ordinary code reaches this: `{items.map(() => <AsyncComp/>)}` is exactly that
 * shape, and the shipped transform wraps it in `jsxEscape`.
 */
async function escapeArrayFrom(
  prefix: string,
  pending: Promise<string>,
  arr: unknown[],
  from: number,
): Promise<RawString> {
  return new RawString(await sequenceFrom(prefix + (await pending), arr, from, renderValue));
}

/**
 * What dialect of the precompile contract this runtime speaks.
 *
 * A transform reads it to know whether it may improve on Deno's output or must
 * reproduce it: only a runtime that answers `"vincle"` promises that a
 * precompiled page renders the same bytes as the dynamic one, because only that
 * promise makes correcting the reference transform safe. Anything else —
 * Preact, Hono, a hand-written adapter — gets Deno's output, defects included,
 * since that is the behaviour its own helpers were written against.
 *
 * An adapter keeps the dialect by re-exporting everything (`export * from`);
 * a named re-export of the three helpers alone drops it, and the transform then
 * treats the target as a foreign runtime. That is the conservative direction.
 */
export const precompileDialect = "vincle";

/**
 * Serialize a single attribute to a `name="value"` string fragment — bare, no
 * separating space. Called by the precompile transform for each attribute
 * expression.
 *
 * Bare because that is the contract every precompile transform is written
 * against: the separator lives in the transform's own static text, so a
 * template compiled for Deno's runtime runs here and vice versa. What that
 * costs is the space left behind when this returns `""`, and `jsxTemplate`
 * takes it back at assembly time — where knowing that the space sits inside a
 * start tag is possible.
 *
 * The value taxonomy lives in `serializeAttr` (`attrs.ts`) — the same module
 * `buildAttrs` delegates to, so the two paths agree by construction rather than
 * by a case list: a divergence between them can go as far as closing the start tag.
 * This wrapper is the async rendez-vous for the precompile path: a promised
 * value recurses per attribute, where `buildAttrsAsync` resolves the batch.
 */
export function jsxAttr(name: string, value: unknown): RawString | Promise<RawString> {
  if (value instanceof Promise) return value.then((v) => jsxAttr(name, v));
  return serializeAttr(name, value);
}

/**
 * Handle the `jsxTemplate` call from the precompile transform — a tagged
 * template literal that interleaves static template fragments with escaped
 * values and VNodes (components the transform left in place, Deno-style).
 *
 * A VNode hole renders through the tree walk (`renderNode`), one hole at a
 * time, in document order — the same sequencing rule as `renderChildrenFrom`
 * in `render.ts`. `Promise.all` over the holes would overlap siblings that
 * mutate the context — the race the sequential walk exists to prevent.
 *
 * One pass: scanning `values` for a promise, mapping them to text, then walking
 * the result to interleave is three traversals and one array for what is almost
 * always a two-hole template.
 */
export function jsxTemplate(
  templates: ArrayLike<string>,
  ...values: unknown[]
): RawString | Promise<RawString> {
  let out = templates[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isDeferredValue(v)) {
      // Bail to the async path from the first asynchronous hole only:
      // everything before it is already final text, so the await covers the
      // suffix and nothing else.
      const prefix = out;
      return renderTemplateAsync(prefix, v, values, i + 1, templates);
    }
    out = appendHole(out, valueToText(v));
    out += templates[i + 1] ?? "";
  }
  return new RawString(out);
}

/**
 * Append one hole's text, dropping the separator a dropped attribute leaves.
 *
 * `<input ${jsxAttr("value", null)}>` renders `<input>`, the same bytes the
 * runtime path emits — the space in front of the hole belongs to an attribute
 * that is not there. Only an empty hole inside a start tag loses it: text keeps
 * its spaces (`<p>a ${""}b</p>` stays `a b`), and so does a hole inside a
 * quoted value (`<div title="a ${""}">`), which is why the scan counts quotes.
 */
function appendHole(out: string, text: string): string {
  if (text !== "") return out + text;
  return out.endsWith(" ") && inStartTag(out) ? out.slice(0, -1) : out;
}

/** Is the tail of `out` inside a start tag, outside any quoted value? */
function inStartTag(out: string): boolean {
  const open = out.lastIndexOf("<");
  if (open === -1 || open < out.lastIndexOf(">")) return false;
  let quotes = 0;
  for (let i = open; i < out.length; i++) {
    if (out.charCodeAt(i) === 34) quotes++;
  }
  return quotes % 2 === 0;
}

/**
 * A hole the synchronous path can't finish alone: a `VNode`, a `Promise`, or a
 * container that may hold one (array, iterable) — the same taxonomy
 * `jsxEscape` owns. Delegating rather than inlining it is what keeps
 * `jsxTemplate` and `jsxEscape` agreeing on the same value. An array holding a
 * `VNode` is where they diverge most easily — one rendering it, the other
 * throwing — and while the shipped transform never emits that shape, this
 * public export lets a caller build it.
 */
function isDeferredValue(v: unknown): boolean {
  return (
    v instanceof Promise ||
    v instanceof VNode ||
    Array.isArray(v) ||
    isIterable(v) ||
    isAsyncIterable(v)
  );
}

async function renderTemplateAsync(
  prefix: string,
  first: unknown,
  values: unknown[],
  from: number,
  templates: ArrayLike<string>,
): Promise<RawString> {
  // Sequential, like `sequenceFrom` in `render.ts` and for the same reason:
  // `Promise.all` would overlap holes that mutate the context. The loop is here
  // rather than in that helper because `appendHole` takes bytes back off `out`,
  // which a concatenating callback cannot express — and both paths must space a
  // template identically, whether or not a hole happened to be a promise.
  let out = appendHole(prefix, await renderValue(first)) + (templates[from] ?? "");
  for (let i = from; i < values.length; i++) {
    out = appendHole(out, await renderValue(values[i]));
    out += templates[i + 1] ?? "";
  }
  return new RawString(out);
}

/**
 * One template hole to final text: a `VNode` through the tree walk, a promise
 * awaited recursively, a container through `jsxEscape` — which owns the
 * container taxonomy — and anything else through `valueToText`, the shared leaf
 * taxonomy (escape.ts).
 *
 * The container branch is what makes `jsxTemplate` and `jsxEscape` agree on the
 * same value instead of one rendering it and the other throwing; see
 * `isDeferredValue`. It delegates rather than re-walking, so a fix to what counts
 * as a renderable container lands in one place.
 */
function renderValue(v: unknown): string | Promise<string> {
  if (v instanceof Promise) return v.then(renderValue);
  if (v instanceof VNode) return renderNode(v);
  if (Array.isArray(v) || isIterable(v) || isAsyncIterable(v)) {
    const escaped = jsxEscape(v);
    return escaped instanceof Promise ? escaped.then(renderEscaped) : renderEscaped(escaped);
  }
  return valueToText(v);
}

/** The two shapes `jsxEscape` can settle to, reduced to final text. */
function renderEscaped(v: RawString | VNode): string | Promise<string> {
  return v instanceof VNode ? renderNode(v) : v.value;
}

export { jsx, jsxs, Fragment, VNode };

// TypeScript resolves `JSX.*` from the module named in `jsxImportSource`, which
// for `jsx: react-jsx` is this one. Declared once in `./jsx-namespace.ts`.
export type { JSX } from "./jsx-namespace.js";
