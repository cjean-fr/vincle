import { RawString } from "./raw.js";
import {
  escapeContent,
  escapeAttr,
  escapeRawText,
  isValidAttrName,
  isValidTagName,
  isSafeScheme,
  isSafeSrcset,
  sanitize,
  URL_ATTRIBUTES,
  RAWTEXT_TAGS,
  ATTRIBUTE_NAME_MAP,
  VOID_ELEMENTS,
} from "./escape.js";

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
  | symbol
  | null
  | undefined
  | RawString
  | Promise<VNode>
  | VNode[]
  | Iterable<VNode>
  | AsyncIterable<VNode>;

/** @deprecated Backwards-compatible alias for {@link VNode}. */
export type VincleNode = VNode;

export type Awaitable<T> = T | Promise<T>;

export type Component<P = {}> = (props: P) => VNode;

// ── Error boundary ────────────────────────────────────────────────────────
//
// `ErrorBoundary` is a marker component: the `ERROR_BOUNDARY` symbol tells the
// runtime to route through `renderBoundary`, which reads `fallback` from props
// and swaps it in when the (already-evaluated) children carry an error — a sync
// `ErrorSentinel` or an async promise rejection.

const ERROR_BOUNDARY = Symbol("vincle/error-boundary");

export function ErrorBoundary(_props: {
  children?: VNode;
  fallback?: VNode | ((error: unknown) => VNode);
}): VNode {
  // Never actually invoked as a plain component — jsx() detects the marker and
  // calls renderBoundary instead. Present so the JSX type-checks as a component.
  return undefined;
}
(ErrorBoundary as unknown as Record<symbol, boolean>)[ERROR_BOUNDARY] = true;

// ── Context (AsyncLocalStorage-only) ────────────────────────────────────────
//
// Rendering happens at jsx() call time, so a component reads context from the
// ambient async scope. Open one with `withScope(() => renderToString(<App/>))`;
// the JSX must be constructed *inside* the callback so its eager evaluation
// runs within the scope. AsyncLocalStorage keeps concurrent scopes isolated.

declare const __brand: unique symbol;

export interface ContextKey<T> {
  readonly [__brand]: T;
}

export type ContextMap = Map<ContextKey<unknown>, unknown>;

const namedContexts = new Map<string, symbol>();

function createContextStore(): {
  run<T>(ctx: ContextMap, fn: () => T | Promise<T>): Promise<T>;
  getStore(): ContextMap | undefined;
} {
  // globalThis: Bun (recent), Deno ≥1.37, Node ≥22
  if (typeof (globalThis as any).AsyncLocalStorage !== "undefined") {
    return new (globalThis as any).AsyncLocalStorage();
  }
  // import from node:async_hooks (Bun via require, older Node via import)
  try {
    const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
    return new AsyncLocalStorage<ContextMap>();
  } catch {}
  // Naive fallback for environments that have neither (fine for single-scope
  // usage; concurrent renders risk context corruption).
  let fallback: ContextMap | undefined;
  return {
    run<T>(ctx: ContextMap, fn: () => T | Promise<T>): Promise<T> {
      const prev = fallback;
      fallback = ctx;
      const restore = () => { fallback = prev; };
      try {
        const result = fn();
        if (result instanceof Promise) return result.finally(restore);
        restore();
        return Promise.resolve(result);
      } catch (e) {
        restore();
        throw e;
      }
    },
    getStore: () => fallback,
  };
}

const contextStore = createContextStore();

function scopeContext(): ContextMap {
  const ctx = contextStore.getStore();
  if (!ctx) {
    throw new Error(
      "[vincle/core] useContext/setContext — no active scope. Wrap your render in withScope(() => renderToString(...)).",
    );
  }
  return ctx;
}

export function context<T>(globalKey: string): ContextKey<T> {
  if (typeof globalKey !== "string" || globalKey.length === 0) {
    throw new Error(
      "[vincle/core] context(key): a non-empty string key is required.",
    );
  }
  let sym = namedContexts.get(globalKey);
  if (!sym) {
    sym = Symbol(globalKey);
    namedContexts.set(globalKey, sym);
  }
  return sym as unknown as ContextKey<T>;
}

export function setContext<T>(key: ContextKey<T>, value: T): void {
  scopeContext().set(key as ContextKey<unknown>, value);
}

export function useContext<T>(key: ContextKey<T>): T {
  const ctx = scopeContext();
  if (!ctx.has(key as ContextKey<unknown>)) {
    throw new Error(
      "[vincle/core] useContext() — context not found in current scope.",
    );
  }
  return ctx.get(key as ContextKey<unknown>) as T;
}

export function snapshot(): ContextMap {
  return new Map(scopeContext());
}

/**
 * Run `fn` inside a fresh context scope. Build and render the JSX *inside* `fn`
 * so components can `useContext`/`setContext`. Optionally inherit an existing
 * scope's entries by passing its map (e.g. `snapshot()`).
 */
export function withScope<T>(
  fn: () => T | Promise<T>,
  parentCtx?: ContextMap,
): Promise<T> {
  return contextStore.run(new Map(parentCtx), fn);
}

// ── Attribute rendering ──────────────────────────────────────────────────

const CSS_PROP_CACHE = new Map<string, string>();
const REGEX_CAMEL_TO_KEBAB = /[A-Z]/g;

const URL_NONE = 0;
const URL_ATTR = 1;
const URL_SRCSET = 2;

function cssPropName(key: string): string {
  if (key.startsWith("--")) return key;
  let cached = CSS_PROP_CACHE.get(key);
  if (cached === undefined) {
    cached = key.replace(REGEX_CAMEL_TO_KEBAB, "-$&").toLowerCase();
    CSS_PROP_CACHE.set(key, cached);
  }
  return cached;
}

const INTERNAL_PROPS = new Set([
  "children", "dangerouslySetInnerHTML", "key", "ref",
]);

function renderStyle(style: Record<string, string | number | undefined>): string {
  let out = "";
  for (const key in style) {
    const value = style[key];
    if (value == null) continue;
    const prop = cssPropName(key);
    if (out) out += ";";
    out += `${prop}:${String(value)}`;
  }
  return out;
}

const ON_MASK =
  ("o".charCodeAt(0) << 8) | "n".charCodeAt(0);

function isEventHandler(name: string): boolean {
  const c2 = name.charCodeAt(2) | 32;
  return (
    (((name.charCodeAt(0) | 32) << 8) | (name.charCodeAt(1) | 32)) === ON_MASK &&
    c2 >= 97 && c2 <= 122
  );
}

const warnedEventHandlers = new Set<string>();

// Per-attribute-name analysis, computed once and cached. An attribute name
// (`class`, `href`, `data-testid`…) recurs thousands of times across a render
// but always resolves the same way — its HTML name, whether it is an event
// handler, whether it is `style`, and its URL-safety class never change. So we
// pay the regex validation / name remap / lowercasing exactly once per distinct
// name, then every occurrence is a single Map lookup + branches on cached flags.
interface AttrMeta {
  name: string;
  isEvent: boolean;
  isStyle: boolean;
  urlKind: 0 | 1 | 2; // 0 = none, 1 = URL attribute, 2 = srcset
}

const ATTR_META_CACHE = new Map<string, AttrMeta | null>();

function computeAttrMeta(name: string): AttrMeta | null {
  if (INTERNAL_PROPS.has(name)) return null;

  let attrName = name;
  if (!isValidAttrName(attrName)) {
    attrName = sanitize(attrName);
    if (!isValidAttrName(attrName)) return null;
  }

  const mapped = ATTRIBUTE_NAME_MAP.get(attrName);
  if (mapped !== undefined) attrName = mapped;

  const isEvent = isEventHandler(attrName);
  if (isEvent) attrName = attrName.toLowerCase();

  if (attrName === "style") {
    return { name: attrName, isEvent: false, isStyle: true, urlKind: 0 };
  }

  const lcName = attrName.toLowerCase();
  const urlKind: 0 | 1 | 2 =
    lcName === "srcset" ? URL_SRCSET : URL_ATTRIBUTES.has(lcName) ? URL_ATTR : URL_NONE;
  return { name: attrName, isEvent, isStyle: false, urlKind };
}

function getAttrMeta(name: string): AttrMeta | null {
  const cached = ATTR_META_CACHE.get(name);
  if (cached !== undefined) return cached;
  const meta = computeAttrMeta(name);
  ATTR_META_CACHE.set(name, meta);
  return meta;
}

function _renderAttr(name: string, value: unknown): Awaitable<string> {
  if (value instanceof Promise) {
    return value.then((v) => _renderAttr(name, v));
  }

  if (value === false || value == null) return "";

  const meta = getAttrMeta(name);
  if (meta === null) return "";
  const attrName = meta.name;

  if (value instanceof RawString) {
    return meta.isEvent ? "" : `${attrName}="${value.value}"`;
  }

  if (meta.isEvent) {
    if (typeof value === "function") {
      if (!warnedEventHandlers.has(name)) {
        warnedEventHandlers.add(name);
        console.warn(
          `[vincle/core] Event handler "${name}" was passed a function. ` +
            "This is not supported in static HTML rendering. Use a string instead.",
        );
      }
      return "";
    }
    if (typeof value !== "string") return "";
  }

  if (meta.isStyle) {
    let style: string;
    if (value !== null && typeof value === "object") {
      style = renderStyle(value as Record<string, string | number | undefined>);
    } else {
      style = String(value);
    }
    if (!style) return "";
    return `style="${escapeAttr(style)}"`;
  }

  if (value === true) return attrName;

  let str = typeof value === "string" ? value : String(value);
  if (meta.urlKind === URL_SRCSET) {
    if (!isSafeSrcset(str)) str = "#blocked";
  } else if (meta.urlKind === URL_ATTR && !isSafeScheme(str)) {
    str = "#blocked";
  }

  return `${attrName}="${escapeAttr(str)}"`;
}

function renderAttrs(
  props: Record<string, unknown> | null | undefined,
): Awaitable<string> {
  if (!props) return "";
  let out = "";
  let pending: Promise<string>[] | null = null;

  for (const key in props) {
    if (INTERNAL_PROPS.has(key)) continue;
    const r = _renderAttr(key, props[key]);
    if (typeof r === "string") {
      if (r) out += ` ${r}`;
    } else {
      (pending ??= []).push(r.then((s) => (s ? ` ${s}` : "")));
    }
  }

  return pending
    ? Promise.all(pending).then((parts) => out + parts.join(""))
    : out;
}

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
  if (ERROR_BOUNDARY in comp) return renderBoundary(props);
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
  return new RawString(`<${tag}${attrs}>${content}</${tag}>`);
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

  if (info.isVoid) {
    return typeof attrs === "string"
      ? new RawString(`<${tag}${attrs}>`)
      : attrs.then((a) => new RawString(`<${tag}${a}>`));
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
  _renderAttr as renderAttr,
  renderChild,
  renderElement,
  renderComponent,
  finalizeNode,
  ErrorSentinel,
};
