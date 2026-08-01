import type { Renderable } from "./types.js";

import { serializeAttr } from "./attrs.js";
import { escapeContent, isIterable, valueToText } from "./escape.js";
import { renderNode } from "./render.js";
import { tryRenderStatic, NOT_STATIC, isValidTag, invalidTagMessage } from "./serialize.js";
import { VNode, raw, RawString } from "./types.js";

// ── jsx — hybrid: single-pass fold of static trees, VNode for dynamic ─────

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode | RawString | Promise<RawString> {
  const props = attributes ?? {};
  const dsih = props["dangerouslySetInnerHTML"] as
    | { __html: string | null | undefined }
    | undefined;

  if (typeof tag === "string") {
    if (!isValidTag(tag)) throw new TypeError(invalidTagMessage(tag));

    if (dsih === undefined) {
      const folded = tryRenderStatic(tag, props);
      if (folded !== NOT_STATIC) return folded;
    }
  }

  // `dangerouslySetInnerHTML` is trusted HTML — `raw` keeps it unescaped.
  let children = props["children"];
  if (dsih !== undefined) {
    const html = dsih.__html;
    if (typeof html === "string") children = raw(html);
    else if (html === null || html === undefined) children = raw("");
    else
      throw new TypeError(
        "[vincle/core] dangerouslySetInnerHTML.__html must be a string, got " + typeof html,
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
      return collectAsyncIterable(v as AsyncIterable<unknown>);
    }
    if (typeof anyV[Symbol.iterator] === "function") {
      return escapeArray(Array.from(v as Iterable<unknown>));
    }
  }
  return new RawString(textValue(v));
}

// Single pass, and the intermediate array only appears at the first genuinely
// async element — the same design `renderChildrenAsync` uses in `render.ts`.
//
// The previous form (`arr.map(jsxEscape)` then `parts.some(…)` then concatenate)
// walked the array three times and allocated it every time, including for the
// all-synchronous case that is the norm — several times slower on the shape
// alone. This is the call a precompiled list page spends most of its time in.
function escapeArray(arr: unknown[]): RawString | Promise<RawString> {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const part = jsxEscape(arr[i]);
    if (part instanceof Promise) {
      // The prefix is already final text; only the suffix has to be awaited —
      // one hole at a time, in document order, never `Promise.all`:
      // a VNode hole renders through the tree walk, whose siblings mutate the
      // context, and overlapping them would reintroduce the race the walk
      // removed. Rendering in order makes the precompiled path agree with the
      // VNode path by construction.
      return escapeArrayFrom(out, part, arr, i + 1);
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

async function escapeArrayFrom(
  prefix: string,
  pending: Promise<string | RawString | VNode>,
  arr: unknown[],
  from: number,
): Promise<RawString> {
  let out = prefix + (await renderHole(await pending));
  for (let i = from; i < arr.length; i++) {
    const part = jsxEscape(arr[i]);
    if (part instanceof Promise) {
      out += await part.then((r) => (r instanceof VNode ? renderNode(r) : r.value));
    } else if (part instanceof VNode) {
      const rendered = renderNode(part);
      out += rendered instanceof Promise ? await rendered : rendered;
    } else {
      out += part.value;
    }
  }
  return new RawString(out);
}

async function collectAsyncIterable(iterable: AsyncIterable<unknown>): Promise<RawString> {
  let out = "";
  for await (const item of iterable) {
    out += await renderHole(jsxEscape(item));
  }
  return new RawString(out);
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
    if (v instanceof Promise || v instanceof VNode) {
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

async function renderTemplateAsync(
  prefix: string,
  first: Promise<unknown> | VNode,
  values: unknown[],
  from: number,
  templates: ArrayLike<string>,
): Promise<RawString> {
  let out = prefix + (await renderHole(first)) + (templates[from] ?? "");
  for (let i = from; i < values.length; i++) {
    out += await renderHole(values[i]);
    out += templates[i + 1] ?? "";
  }
  return new RawString(out);
}

/**
 * One template hole to final text: a `VNode` through the tree walk, a promise
 * awaited recursively, anything else through `valueToText` — the shared leaf
 * taxonomy (escape.ts), which also absorbs the old `RawString` branch.
 */
function renderHole(v: unknown): string | Promise<string> {
  if (v instanceof Promise) return v.then(renderHole);
  if (v instanceof VNode) return renderNode(v);
  return valueToText(v);
}

export { jsx, jsxs, Fragment, VNode };

// TypeScript resolves `JSX.*` from the module named in `jsxImportSource`, which
// for `jsx: react-jsx` is this one. Declared once in `./jsx-namespace.ts`.
export type { JSX } from "./jsx-namespace.js";
