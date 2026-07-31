import type { Renderable } from "./types.js";

import {
  attrMeta,
  BOOLEAN_ATTRIBUTES,
  classToString,
  isPlainObject,
  styleToString,
} from "./attrs.js";
import { escapeAttr, escapeContent, isSafeScheme } from "./escape.js";
import { tryRenderStatic, NOT_STATIC, isValidTag, invalidTagMessage } from "./serialize.js";
import { raw, RawString } from "./types.js";

// ── VNode ────────────────────────────────────────────────────────────────

class VNode {
  readonly tag: string | ((props: any) => any);
  readonly attrs: Record<string, unknown>;
  readonly children: unknown;

  constructor(
    tag: string | ((props: any) => any),
    attrs: Record<string, unknown>,
    children: unknown,
  ) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = children;
  }
}

// ── jsx — hybrid: single-pass fold of static trees, VNode for dynamic ─────

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode | RawString | Promise<RawString> {
  const props = attributes ?? {};
  const dsih = props["dangerouslySetInnerHTML"] as { __html: unknown } | undefined;

  if (typeof tag === "string") {
    // The single gate for tag names. `jsx()` is the only way a string tag enters
    // the engine — the fold and the tree walks all sit behind it — so validating
    // here validates every path exactly once, and does it at construction, where
    // the stack still points at the element the developer wrote.
    if (!isValidTag(tag)) throw new TypeError(invalidTagMessage(tag));

    // `dangerouslySetInnerHTML` is the only prop the fold cannot see, because it
    // replaces the children the fold reads from `props`. Every other shape it
    // handles, so this is the whole of the prop check that used to live there.
    if (dsih === undefined) {
      const folded = tryRenderStatic(tag, props);
      if (folded !== NOT_STATIC) return folded;
    }
  }

  return new VNode(
    tag,
    props,
    dsih !== undefined ? trustedInnerHTML(dsih.__html) : props["children"],
  );
}

/**
 * `dangerouslySetInnerHTML.__html` as a renderable child.
 *
 * The coercion used to be eager, so a promise — which the prop's type has always
 * allowed — reached the document as `[object Promise]`. That is the exact silent
 * corruption ADR-003 names as the reason this package has a single render entry
 * point; it has no more right to exist here. Awaiting keeps both contracts: the
 * HTML stays trusted (unescaped), and async stays something the developer never
 * has to think about.
 */
function trustedInnerHTML(html: unknown): RawString | Promise<RawString> {
  if (html instanceof Promise) return html.then(trustedInnerHTML);
  return raw(String(html ?? ""));
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
 * Returns either a `RawString` (synchronous case) or a `Promise<RawString>`
 * (when the value contains promises or async iterables).
 */
export function jsxEscape(v: unknown): RawString | Promise<RawString> {
  if (v instanceof RawString) return v;
  if (v instanceof Promise) return v.then((resolved) => jsxEscape(resolved));
  if (Array.isArray(v)) return escapeArray(v);
  if (v != null && typeof v !== "string") {
    const anyV = v as { [Symbol.iterator]?: unknown; [Symbol.asyncIterator]?: unknown };
    if (typeof anyV[Symbol.asyncIterator] === "function") {
      return collectAsyncIterable(v as AsyncIterable<unknown>);
    }
    if (typeof anyV[Symbol.iterator] === "function") {
      return escapeArray(Array.from(v as Iterable<unknown>));
    }
  }
  return new RawString(coerce(v));
}

// Single pass, and the intermediate array only appears at the first genuinely
// async element — the same design `renderChildrenAsync` uses in `render.ts`.
//
// The previous form (`arr.map(jsxEscape)` then `parts.some(…)` then concatenate)
// walked the array three times and allocated it every time, including for the
// all-synchronous case that is the norm. Measured on the shape alone: 28.5 → 10.3
// ns at n=2, 10.97 → 4.40 µs at n=1000 (×2.5–2.8). This is the call a precompiled
// list page spends most of its time in.
function escapeArray(arr: unknown[]): RawString | Promise<RawString> {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const part = jsxEscape(arr[i]);
    if (part instanceof Promise) {
      // The prefix is already final text; only the suffix has to be awaited.
      const prefix = out;
      const parts: (RawString | Promise<RawString>)[] = [part];
      for (i++; i < arr.length; i++) parts.push(jsxEscape(arr[i]));
      return Promise.all(parts).then((resolved) => {
        let tail = "";
        for (let j = 0; j < resolved.length; j++) tail += resolved[j]!.value;
        return new RawString(prefix + tail);
      });
    }
    out += part.value;
  }
  return new RawString(out);
}

async function collectAsyncIterable(iterable: AsyncIterable<unknown>): Promise<RawString> {
  let out = "";
  for await (const item of iterable) {
    const r = jsxEscape(item);
    out += (r instanceof Promise ? await r : r).value;
  }
  return new RawString(out);
}

/**
 * Serialize a single attribute to a `name="value"` string fragment.
 * Called by the precompile transform for each attribute expression.
 */
export function jsxAttr(name: string, value: unknown): RawString | Promise<RawString> {
  if (value instanceof Promise) {
    return value.then((v) => jsxAttr(name, v));
  }

  if (value == null) return raw("");

  if (name === "children" || name === "key" || name === "ref" || name === "dangerouslySetInnerHTML")
    return raw("");

  // One memoized lookup for the resolved name, its validity and whether it is a
  // URL attribute — the same `attrMeta` `buildAttrs` uses. Asking the three
  // questions separately here, uncached, cost 11% of the precompiled-list
  // benchmark; sharing the cache also makes it impossible for the two paths to
  // resolve a name differently.
  //
  // The validity gate matters on this path as much as the other: a name reaching a
  // runtime helper is not necessarily author-written — a spread, a computed key, or
  // a transform that does not bail on spreads the way `@vincle/precompile-core`
  // does, all put caller-controlled text here. `x"><script>` used to be emitted
  // verbatim, closing the start tag, while `buildAttrs` dropped it: the very
  // injection `compiler-contract.test.ts` pins was open whenever the precompile
  // transform was enabled.
  const meta = attrMeta(name);
  if (!meta.valid) return raw("");
  const attrName = meta.name;

  // No `on…` branch — same reason as `buildAttrs`: a handler is an attribute like
  // any other, and a function is unserializable whatever it is called. This path
  // used to drop `onClick={fn}` with a warning while `buildAttrs` threw, so the
  // same component crashed or rendered depending on whether the precompile plugin
  // was enabled.
  if (typeof value === "function") {
    throw new Error(
      `[vincle/core] Attribute "${name}" received a function as value. ` +
        "Functions are not serializable to HTML.",
    );
  }

  if (value instanceof RawString) {
    return new RawString(`${attrName}="${value.value}"`);
  }

  // Style object → string. `isPlainObject`, like `buildAttrs`: only an object
  // literal is a bag of declarations.
  if (attrName === "style" && isPlainObject(value)) {
    const styleStr = styleToString(value as Record<string, string | number | null | undefined>);
    if (!styleStr) return raw("");
    return new RawString(`style="${escapeAttr(styleStr)}"`);
  }

  // Class array → string
  if (attrName === "class" && Array.isArray(value)) {
    const s = classToString(value);
    if (!s) return raw("");
    return new RawString(`class="${escapeAttr(s)}"`);
  }

  // Boolean attribute
  if (typeof value === "boolean") {
    if (BOOLEAN_ATTRIBUTES.has(attrName)) {
      return value ? raw(attrName) : raw("");
    }
    return new RawString(`${attrName}="${value}"`);
  }

  // `meta.isUrl`, not a local switch: the switch this path used to carry
  // duplicated `URL_ATTRIBUTES` and had already drifted from it — `data` was added
  // to the set and `<object data="javascript:…">` stayed unchecked here only. One
  // source of truth, one behaviour.
  let str = String(value);
  if (meta.isUrl && !isSafeScheme(str)) str = "#blocked";

  return new RawString(`${attrName}="${escapeAttr(str)}"`);
}

function coerce(v: unknown): string {
  if (v == null || v === true || v === false) return "";
  if (typeof v === "string") return escapeContent(v);
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (Array.isArray(v)) {
    let out = "";
    for (let i = 0; i < v.length; i++) out += coerce(v[i]!);
    return out;
  }
  if (v != null && typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function") {
    return coerce(Array.from(v as Iterable<unknown>));
  }
  return escapeContent(String(v));
}

/**
 * Handle the `jsxTemplate` call from the precompile transform — a tagged
 * template literal that interleaves static template fragments with escaped
 * values.
 *
 * One pass. The previous form scanned `values` for a promise, then mapped it
 * through `coerceRawString`, then walked the resulting array again to interleave
 * — three traversals and one array for what is almost always a two-hole
 * template. Measured on the shape alone: 25.2 → 17.8 ns (×1.42).
 */
export function jsxTemplate(
  templates: ArrayLike<string>,
  ...values: unknown[]
): RawString | Promise<RawString> {
  let out = templates[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v instanceof Promise) {
      // Bail to the async path from the first promise only: everything before it
      // is already final text, so the await covers the suffix and nothing else.
      const prefix = out;
      const from = i;
      return Promise.all(values.slice(from)).then((resolved) => {
        let tail = "";
        for (let j = 0; j < resolved.length; j++) {
          tail += coerceRawString(resolved[j]);
          tail += templates[from + j + 1] ?? "";
        }
        return new RawString(prefix + tail);
      });
    }
    out += coerceRawString(v);
    out += templates[i + 1] ?? "";
  }
  return new RawString(out);
}

/** Like `coerce`, but lets `RawString` through without double-escaping. */
function coerceRawString(v: unknown): string {
  if (v instanceof RawString) return v.value;
  return coerce(v);
}

export { jsx, jsxs, Fragment, VNode };

// TypeScript resolves `JSX.*` from the module named in `jsxImportSource`, which
// for `jsx: react-jsx` is this one. Declared once in `./jsx-namespace.ts`.
export type { JSX } from "./jsx-namespace.js";
