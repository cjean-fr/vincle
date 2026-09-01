import type { Renderable } from "./types.js";

import { serializeAttr } from "./attrs.js";
import { escapeContent, isAsyncIterable, isIterable, valueToText } from "./escape.js";
import { collectAsyncIterable, renderNode, sequenceFrom } from "./render.js";
import { tryRenderStatic, NOT_STATIC } from "./serialize.js";
import { VNode, raw, RawString } from "./types.js";

// ── jsx — hybrid: single-pass fold of static trees, VNode for dynamic ─────

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode | RawString | Promise<RawString> {
  const props = attributes ?? {};
  // `hasOwn` for the same reason as the three loops in `attrs.ts`: a props
  // object reaches here from user code, and an enumerable `Object.prototype`
  // property would otherwise be read as if the author had written it. This one
  // is the sharpest of the set — `dangerouslySetInnerHTML` bypasses the whole
  // escaping chain, so the gadget injects unescaped HTML into every element.
  const dsih = (
    Object.hasOwn(props, "dangerouslySetInnerHTML") ? props["dangerouslySetInnerHTML"] : undefined
  ) as { __html: string | null | undefined } | undefined;

  // The tag name is validated by whichever of the two paths below takes over:
  // `tryRenderStatic` for a folded element, the `VNode` constructor otherwise.
  // One check per element either way, and no way past it.
  if (typeof tag === "string" && dsih === undefined) {
    const folded = tryRenderStatic(tag, props);
    if (folded !== NOT_STATIC) return folded;
  }

  // `dangerouslySetInnerHTML` is trusted HTML — `raw` keeps it unescaped.
  let children = Object.hasOwn(props, "children") ? props["children"] : undefined;
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
  return new RawString(textValue(v));
}

// Single pass, matching `renderChildrenAsync` in `render.ts` — the previous
// three-pass form (`map` then `some` then concatenate) was several times
// slower on the all-synchronous case that's the norm here.
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
 * that worth stating. They used to disagree: the promise branch passed a
 * `Promise<RawString | VNode>` (a value still to be rendered) and the VNode
 * branch passed a `Promise<string>` (HTML already rendered by the tree walk).
 * One `renderValue` served both, so the second was sent back through the leaf
 * taxonomy and `escapeContent` ran over finished markup — an async component
 * inside an array came out as `&lt;i&gt;two&lt;/i&gt;` on the precompile path
 * and `<i>two</i>` on every other one.
 *
 * Reachable through the shipped transform: `{items.map(() => <AsyncComp/>)}` is
 * ordinary code, and the transform wraps it in `jsxEscape`. It survived because
 * the precompile suite was a case list; `precompile-equivalence.test.ts` found
 * it on the first run.
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
 * Serialize a single attribute to a `name="value"` string fragment.
 * Called by the precompile transform for each attribute expression.
 *
 * The value taxonomy lives in `serializeAttr` (`attrs.ts`) — the same module
 * `buildAttrs` delegates to, so the two paths agree by construction instead of
 * by a case list (they drifted four times; one drift closed the start tag).
 * This wrapper is the async rendez-vous for the precompile path: a promised
 * value recurses per attribute, where `buildAttrsAsync` resolves the batch.
 */
export function jsxAttr(name: string, value: unknown): RawString | Promise<RawString> {
  if (value instanceof Promise) return value.then((v) => jsxAttr(name, v));
  return serializeAttr(name, value);
}

function textValue(v: unknown): string {
  if (typeof v === "string") return escapeContent(v);
  if (Array.isArray(v)) {
    let out = "";
    for (let i = 0; i < v.length; i++) out += textValue(v[i]!);
    return out;
  }
  if (isIterable(v)) {
    return textValue(Array.from(v as Iterable<unknown>));
  }
  return valueToText(v);
}

/**
 * Handle the `jsxTemplate` call from the precompile transform — a tagged
 * template literal that interleaves static template fragments with escaped
 * values and VNodes (components the transform left in place, Deno-style).
 *
 * A VNode hole renders through the tree walk (`renderNode`), one hole at a
 * time, in document order — the same sequencing rule as `renderChildrenFrom`
 * in `render.ts`. `Promise.all` over the holes would overlap siblings that
 * mutate the context, reintroducing the race the sequential walk removed.
 *
 * One pass. The previous form scanned `values` for a promise, then mapped it
 * through `textValue`, then walked the resulting array again to interleave
 * — three traversals and one array for what is almost always a two-hole
 * template.
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
    out += textValue(v);
    out += templates[i + 1] ?? "";
  }
  return new RawString(out);
}

/**
 * A hole the synchronous path can't finish alone: a `VNode`, a `Promise`, or a
 * container that may hold one (array, iterable) — the same taxonomy
 * `jsxEscape` owns. Delegating rather than inlining it is what keeps
 * `jsxTemplate` and `jsxEscape` agreeing on the same value: they used to
 * diverge on an array holding a `VNode` (one rendered it, the other threw),
 * unreachable through the shipped transform but not through this public export.
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
  return new RawString(
    await sequenceFrom(
      prefix + (await renderValue(first)) + (templates[from] ?? ""),
      values,
      from,
      async (v, i) => (await renderValue(v)) + (templates[i + 1] ?? ""),
    ),
  );
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
