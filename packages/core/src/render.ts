import { RawString } from "./raw.js";
import {
  escapeContent,
  escapeRawText,
  isValidTagName,
  RAWTEXT_TAGS,
  VOID_ELEMENTS,
} from "./escape.js";
import { renderAttrs } from "./render-attrs.js";

// ── Rendering model ─────────────────────────────────────────────────────────
//
// Rendering is **eager**: `jsx(...)` renders to an HTML string (wrapped in a
// `RawString`) at call time, bottom-up, as the JSX expression is evaluated —
// there is no descriptor tree and no separate render walk. `renderToString`
// only unwraps the already-rendered `RawString`.
//
// A synchronous error thrown by a component cannot unwind normally: by the time
// a parent (or an `ErrorBoundary`) runs, its children have already been
// evaluated. So a sync throw is captured into an `ErrorSentinel` value that
// propagates *up* through elements (which pass it through) until an
// `ErrorBoundary` turns it into a fallback, or `renderToString` re-throws it.
// Async errors travel the normal way — as promise rejections.

class ErrorSentinel {
  readonly error: unknown;
  constructor(error: unknown) {
    this.error = error;
  }
}

/** A rendered child: a plain string, a propagating error, or either async. */
type Rendered = string | ErrorSentinel | Promise<string | ErrorSentinel>;
/** A rendered node (element/component): a RawString, a propagating error, or either async. */
type Node = RawString | ErrorSentinel | Promise<RawString | ErrorSentinel>;

// ── VNode types ────────────────────────────────────────────────────────────

export type VNode =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | RawString
  | ErrorSentinel
  | Promise<VNode>
  | VNode[]
  | Iterable<VNode>
  | AsyncIterable<VNode>;

export type Awaitable<T> = T | Promise<T>;

export type Component<P = {}> = (props: P) => VNode;

// ── Error boundary ────────────────────────────────────────────────────────
//
// `ErrorBoundary` is a marker component registered in the `boundaryComponents`
// set. When `renderComponent` finds it in the set, it routes through
// `renderBoundary`, which reads `fallback` from props and swaps it in when the
// (already-evaluated) children carry an error — a sync `ErrorSentinel` or an
// async promise rejection.

export function ErrorBoundary(_props: {
  children?: VNode;
  fallback?: VNode | ((error: unknown) => VNode);
}): VNode {
  throw new TypeError(
    "[vincle/core] ErrorBoundary must be used within jsx(), not called directly.",
  );
}
const boundaryComponents = new Set<Function>();
boundaryComponents.add(ErrorBoundary);

// ── Error annotation ──────────────────────────────────────────────────────

const ANNOTATED_ERROR = Symbol("annotated");

function componentName(comp: Component, error?: unknown): string {
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
function annotateError(error: unknown, comp: Component): unknown {
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

function renderArray(arr: unknown[], rawtextTag: string | undefined): Rendered {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const r = renderChild(arr[i], rawtextTag);
    if (typeof r === "string") {
      out += r;
      continue;
    }
    if (r instanceof ErrorSentinel) return r;
    // Async child: resolve it plus every remaining child in parallel.
    const rest: Rendered[] = [r];
    for (let j = i + 1; j < arr.length; j++) rest.push(renderChild(arr[j], rawtextTag));
    return Promise.all(rest).then((parts) => {
      let result = out;
      for (const p of parts) {
        if (p instanceof ErrorSentinel) return p;
        result += p;
      }
      return result;
    });
  }
  return out;
}

async function renderAsyncIterable(
  iterable: AsyncIterable<unknown>,
  rawtextTag: string | undefined,
): Promise<string | ErrorSentinel> {
  let out = "";
  for await (const item of iterable) {
    const r = renderChild(item, rawtextTag);
    const s = r instanceof Promise ? await r : r;
    if (s instanceof ErrorSentinel) return s;
    out += s;
  }
  return out;
}

function renderChild(value: unknown, rawtextTag?: string): Rendered {
  if (value == null || value === true || value === false) return "";
  if (typeof value === "string") {
    return rawtextTag ? escapeRawText(value, rawtextTag) : escapeContent(value);
  }
  if (typeof value === "number") return String(value);
  if (value instanceof RawString) return value.value;
  if (value instanceof ErrorSentinel) return value;
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
  return rawtextTag
    ? escapeRawText(String(value), rawtextTag)
    : escapeContent(String(value));
}

/** Normalize a rendered child into a node: string → RawString, else pass through. */
function finalizeNode(r: Rendered): Node {
  if (typeof r === "string") return new RawString(r);
  if (r instanceof ErrorSentinel) return r;
  return r.then((s) => (s instanceof ErrorSentinel ? s : new RawString(s)));
}

function toErrorNode(error: unknown, comp: Component): ErrorSentinel {
  return new ErrorSentinel(annotateError(error, comp));
}

function renderComponent(
  comp: Component,
  props: Record<string, unknown>,
): Node {
  if (boundaryComponents.has(comp)) return renderBoundary(props);
  try {
    const r = renderChild(comp(props));
    if (typeof r === "string") return new RawString(r);
    if (r instanceof ErrorSentinel) return toErrorNode(r.error, comp);
    return r.then(
      (s) =>
        s instanceof ErrorSentinel ? toErrorNode(s.error, comp) : new RawString(s),
      (e) => {
        throw annotateError(e, comp);
      },
    );
  } catch (e) {
    return toErrorNode(e, comp);
  }
}

function renderBoundary(props: Record<string, unknown>): Node {
  const fallback = props["fallback"] as
    | VNode
    | ((error: unknown) => VNode);
  const onError = (e: unknown): Node =>
    finalizeNode(
      renderChild(
        typeof fallback === "function"
          ? (fallback as (e: unknown) => VNode)(e)
          : fallback,
      ),
    );
  const r = renderChild(props["children"]);
  if (r instanceof ErrorSentinel) return onError(r.error);
  if (typeof r === "string") return new RawString(r);
  return r.then(
    (s) => (s instanceof ErrorSentinel ? onError(s.error) : new RawString(s)),
    (e) => onError(e),
  );
}

function renderInnerHTML(__html: unknown): Awaitable<string> {
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

// One cache entry per distinct tag folds the four per-element checks
// (isValidTagName, lowercasing, RAWTEXT_TAGS, VOID_ELEMENTS) into a single
// Map lookup on the hot path. Computed once, then reused for every occurrence.
const TAG_INFO_CACHE = new Map<string, TagInfo>();

function tagInfo(tag: string): TagInfo {
  let info = TAG_INFO_CACHE.get(tag);
  if (info === undefined) {
    const valid = isValidTagName(tag);
    const lc = tag.toLowerCase();
    info = {
      valid,
      rawtext: valid && RAWTEXT_TAGS.has(lc) ? lc : undefined,
      isVoid: valid && VOID_ELEMENTS.has(tag),
    };
    TAG_INFO_CACHE.set(tag, info);
  }
  return info;
}

function wrapElement(tag: string, attrs: string, content: string): RawString {
  return new RawString("<" + tag + attrs + ">" + content + "</" + tag + ">");
}

function renderElement(
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

  const innerHTML = props["dangerouslySetInnerHTML"] as
    | { __html: unknown }
    | undefined;
  const content: Rendered = innerHTML
    ? renderInnerHTML(innerHTML.__html)
    : renderChild(props["children"], info.rawtext);

  if (typeof attrs === "string") {
    if (typeof content === "string") return wrapElement(tag, attrs, content);
    if (content instanceof ErrorSentinel) return content;
    return content.then((c) =>
      c instanceof ErrorSentinel ? c : wrapElement(tag, attrs, c),
    );
  }

  return attrs.then((a) => {
    if (typeof content === "string") return wrapElement(tag, a, content);
    if (content instanceof ErrorSentinel) return content;
    return (content as Promise<string | ErrorSentinel>).then((c) =>
      c instanceof ErrorSentinel ? c : wrapElement(tag, a, c),
    );
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Render a value to an HTML string. Sync-capable; returns a Promise only when the tree contains async work. */
export function render(value: unknown, rawtextTag?: string): Awaitable<string> {
  const r = renderChild(value, rawtextTag);
  if (typeof r === "string") return r;
  if (r instanceof ErrorSentinel) throw r.error;
  return r.then((s) => {
    if (s instanceof ErrorSentinel) throw s.error;
    return s;
  });
}

/** Render a JSX tree to an HTML string. Always async for a stable signature. */
export async function renderToString(node: VNode): Promise<string> {
  const r = renderChild(node);
  const s = r instanceof Promise ? await r : r;
  if (s instanceof ErrorSentinel) throw s.error;
  return s;
}

// ── Exports for jsx-runtime ────────────────────────────────────────────────

export {
  renderChild,
  renderElement,
  renderComponent,
  finalizeNode,
};
