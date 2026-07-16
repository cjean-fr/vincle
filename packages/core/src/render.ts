import {
  escapeContent,
  escapeRawText,
  isValidTagName,
  RAWTEXT_TAGS,
  VOID_ELEMENTS,
} from "./escape.js";
import { RawString } from "./raw.js";
import { renderAttrs } from "./render-attrs.js";

// ── Rendering model ─────────────────────────────────────────────────────────
//
// Rendering is **eager**: `jsx(...)` renders to an HTML string (wrapped in a
// `RawString`) at call time, bottom-up, as the JSX expression is evaluated —
// there is no descriptor tree and no separate render walk. `renderToString`
// only unwraps the already-rendered `RawString`.
//
// Errors propagate naturally as JavaScript exceptions (throw / rejection).
// There is no error-boundary mechanism in @vincle/core. If a component throws,
// the error propagates to `renderToString` (or to `renderToStream` in
// @vincle/flow). Catch errors at the call site with try/catch.

export type Awaitable<T> = T | Promise<T>;

type Rendered = Awaitable<string>;
type Node = Awaitable<RawString>;

// ── VNode types ────────────────────────────────────────────────────────────

export type VNode =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | RawString
  | Promise<VNode>
  | VNode[]
  | Iterable<VNode>
  | AsyncIterable<VNode>;

/** VNode with the recursive `Promise` removed. Use as a cast target in
 * thenable-sensitive contexts (e.g. `yield <li>x</li> as ResolvedVNode`)
 * to avoid TS1062 ("Type referenced in its own `then` callback"). */
export type ResolvedVNode = Exclude<VNode, Promise<any>>;

export type Component<P = {}> = (props: P) => VNode;

// ── Error annotation ──────────────────────────────────────────────────────

const ANNOTATED_ERROR = Symbol("annotated");

function componentName(this: void, comp: Component, error?: unknown): string {
  if ((comp as any).displayName) return (comp as any).displayName;
  const n = comp.name;
  if (n) return n;
  if (error instanceof Error && typeof error.stack === "string") {
    for (const line of error.stack.split("\n")) {
      const m = line.trim().match(/^at\s+(?:async\s+)?(\S+)/);
      if (m && m[1] && m[1] !== "async" && m[1] !== "<anonymous>") return m[1];
    }
  }
  return "<anonymous>";
}

/** Accumulates component names as a stack: `[Boom > Child > Parent]` */
function annotateError(this: void, error: unknown, comp: Component): unknown {
  const name = componentName(comp, error);
  if (error instanceof Error) {
    const existing = (error as any)[ANNOTATED_ERROR];
    const prefix = existing ? `${existing} > ${name}` : name;
    const msg = `[${prefix}] ${error.message.replace(/^\[.*?\]\s*/, "")}`;
    try {
      (error as any).message = msg;
    } catch {
      const wrapped = new Error(msg);
      if (typeof error.stack === "string") wrapped.stack = error.stack;
      return wrapped;
    }
    try {
      (error as any)[ANNOTATED_ERROR] = prefix;
    } catch {
      // non-extensible — annotation still worked via message
    }
    return error;
  }
  const annotated = new Error(`[${name}] ${String(error)}`);
  Object.defineProperty(annotated, ANNOTATED_ERROR, { value: name });
  return annotated;
}

// ── Core render (eager) ────────────────────────────────────────────────────

function renderArray(this: void, arr: unknown[], rawtextTag: string | undefined): Rendered {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const r = renderChild(arr[i], rawtextTag);
    if (typeof r === "string") {
      out += r;
      continue;
    }
    // Async child: resolve it plus every remaining child in parallel.
    const rest: Rendered[] = [r];
    for (let j = i + 1; j < arr.length; j++) rest.push(renderChild(arr[j], rawtextTag));
    return Promise.all(rest).then((parts) => {
      let result = out;
      for (const p of parts) result += p;
      return result;
    });
  }
  return out;
}

async function renderAsyncIterable(
  this: void,
  iterable: AsyncIterable<unknown>,
  rawtextTag: string | undefined,
): Promise<string> {
  let out = "";
  for await (const item of iterable) {
    const r = renderChild(item, rawtextTag);
    const s = r instanceof Promise ? await r : r;
    out += s;
  }
  return out;
}

function renderChild(this: void, value: unknown, rawtextTag?: string): Rendered {
  if (value == null || value === true || value === false) return "";
  if (typeof value === "string") {
    return rawtextTag ? escapeRawText(value, rawtextTag) : escapeContent(value);
  }
  if (typeof value === "number") return String(value);
  if (value instanceof RawString) return value.value;
  if (value instanceof Promise) {
    return value.then((v) => renderChild(v, rawtextTag));
  }
  if (Array.isArray(value)) return renderArray(value, rawtextTag);
  if (typeof (value as any)?.[Symbol.iterator] === "function") {
    return renderChild(Array.from(value as Iterable<unknown>), rawtextTag);
  }
  if (typeof (value as any)?.[Symbol.asyncIterator] === "function") {
    return renderAsyncIterable(value as AsyncIterable<unknown>, rawtextTag);
  }
  return rawtextTag ? escapeRawText(String(value), rawtextTag) : escapeContent(String(value));
}

/** Normalize a rendered child into a node: string → RawString, else pass through. */
function finalizeNode(this: void, r: Rendered): Node {
  if (typeof r === "string") return new RawString(r);
  return r.then((s) => new RawString(s));
}

function renderComponent(this: void, comp: Component, props: Record<string, unknown>): Node {
  try {
    const result = comp(props);
    // Already-rendered RawString from a nested jsx() call — pass through as-is.
    if (result instanceof RawString) return result;
    const r = renderChild(result);
    if (typeof r === "string") return new RawString(r);
    // Async: wait for child resolution then wrap.
    return r.then(
      (s) => new RawString(s),
      (e: unknown) => {
        throw annotateError(e, comp);
      },
    );
  } catch (e) {
    throw annotateError(e, comp);
  }
}

function renderInnerHTML(this: void, __html: unknown): Awaitable<string> {
  if (__html == null) return "";
  if (__html instanceof Promise) {
    return __html.then((v: unknown) => (v == null ? "" : String(v)));
  }
  return String(__html);
}

interface TagInfo {
  valid: boolean;
  rawtext: string | undefined;
  isVoid: boolean;
}

// Cache tag info per distinct tag name. Bounded at 1000 entries so a
// malicious generator of unique tag names (via jsx(dynamicString)) can't grow
// the Map without limit. The check costs ~0% on the hot path (benchmarked),
// and keeping the Map small also avoids hash-collision slowdown at scale.
const MAX_TAG_CACHE = 1000;
const TAG_INFO_CACHE = new Map<string, TagInfo>();

function tagInfo(this: void, tag: string): TagInfo {
  let info = TAG_INFO_CACHE.get(tag);
  if (info === undefined) {
    const valid = isValidTagName(tag);
    const lc = tag.toLowerCase();
    info = {
      valid,
      rawtext: valid && RAWTEXT_TAGS.has(lc) ? lc : undefined,
      isVoid: valid && VOID_ELEMENTS.has(tag),
    };
    if (TAG_INFO_CACHE.size >= MAX_TAG_CACHE) TAG_INFO_CACHE.clear();
    TAG_INFO_CACHE.set(tag, info);
  }
  return info;
}

function wrapElement(this: void, tag: string, attrs: string, content: string): RawString {
  return new RawString("<" + tag + attrs + ">" + content + "</" + tag + ">");
}

function renderElement(
  this: void,
  tag: string,
  props: Record<string, unknown> | null | undefined,
): Node {
  if (!props) props = {};
  const info = tagInfo(tag);
  if (!info.valid) {
    // A tag that could break out of `<...>` is a programming error (only
    // reachable via a manual jsx(dynamicString) call — the JSX parser never
    // emits one). Fail loud, like Preact and Hono, rather than silently drop.
    throw new TypeError(
      `[vincle/core] Invalid tag name ${JSON.stringify(tag)}: a tag name must not be empty, ` +
        'start with "!" or "?", or contain whitespace, control characters, or any of " \' < > / = ` \\.',
    );
  }

  const attrs = renderAttrs(props);

  // Void elements (eg. `<br>`, `<img>`) are rendered **without** a trailing
  // slash (`<br>`, NOT `<br/>`). See `VOID_ELEMENTS` in `escape.ts` for the
  // full rationale: HTML5 spec-correct, email-safe, smaller.
  if (info.isVoid) {
    return typeof attrs === "string"
      ? new RawString("<" + tag + attrs + ">")
      : attrs.then((a) => new RawString("<" + tag + a + ">"));
  }

  const innerHTML = props["dangerouslySetInnerHTML"] as { __html: unknown } | undefined;
  const content: Awaitable<string> = innerHTML
    ? renderInnerHTML(innerHTML.__html)
    : renderChild(props["children"], info.rawtext);

  if (typeof attrs === "string") {
    if (typeof content === "string") return wrapElement(tag, attrs, content);
    return content.then((c) => wrapElement(tag, attrs, c));
  }

  return attrs.then((a) => {
    if (typeof content === "string") return wrapElement(tag, a, content);
    return content.then((c) => wrapElement(tag, a, c));
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Render a value to an HTML string. Sync-capable; returns a Promise only when the tree contains async work. */
export function render(this: void, value: unknown, rawtextTag?: string): Awaitable<string> {
  const r = renderChild(value, rawtextTag);
  if (typeof r === "string") return r;
  return r;
}

/** Render a JSX tree to an HTML string. Always async for a stable signature. */
export async function renderToString(this: void, node: VNode): Promise<string> {
  const r = renderChild(node);
  const s = r instanceof Promise ? await r : r;
  return s;
}

// ── Exports for jsx-runtime ────────────────────────────────────────────────

export { renderChild, renderElement, renderComponent, finalizeNode };
