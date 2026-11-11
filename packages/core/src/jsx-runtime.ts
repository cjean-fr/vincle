import type { Renderable } from "./types.js";

import { ElementAttr, serializeTemplateAttr } from "./attrs.js";
import {
  ERR_DANGEROUS_HTML,
  ERR_AMBIGUOUS_HTML_CHILDREN,
  ERR_INVALID_TAG,
  vincleTypeError,
} from "./errors.js";
import { escapeContent, isAsyncIterable, isIterable, valueToText } from "./escape.js";
import { mayTransition, scanTextContext, type ParseContext } from "./parse-context.js";
import { ownChildren } from "./props.js";
import { renderNode, settleConcurrent } from "./render.js";
import { invalidTagMessage, isValidTag } from "./tag.js";
import { renderElementAttr } from "./template-attrs.js";
import { VNode, raw, RawString, TemplateNode } from "./types.js";

// ── Neutral tree: every element is a VNode; serialization is the walk's job ──
//
// jsx() builds the tree and never serializes it: the escaping of a text node
// depends on the parser context it lands in (rawtext in HTML, ordinary markup
// in foreign content), which is only known when the tree is walked.

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode {
  const props = attributes ?? {};

  // The only place a string tag is validated: every exit below inherits a
  // valid name the tree walk can trust.
  if (typeof tag === "string" && !isValidTag(tag)) {
    throw vincleTypeError(invalidTagMessage(tag), ERR_INVALID_TAG);
  }

  // Read first, `hasOwn` only on a hit: an absent prop costs one property miss.
  // The prop bypasses escaping and an `Object.prototype` gadget for it is plain
  // JSON, hence the guard. Only a string tag is the HTML sink: a function tag's
  // prop belongs to the component and is passed through untouched.
  const isStringTag = typeof tag === "string";
  const dsihValue = isStringTag ? props["dangerouslySetInnerHTML"] : undefined;
  // A `null` prop is absent, as in React (`null != innerHTML`).
  const dsih = (
    dsihValue != null && Object.hasOwn(props, "dangerouslySetInnerHTML") ? dsihValue : undefined
  ) as { __html: string | null | undefined } | undefined;

  // `dangerouslySetInnerHTML` is trusted HTML: `raw` keeps it unescaped.
  let children = ownChildren(props);
  if (dsih !== undefined) {
    // React's rule (`pushInnerHTML` in react-dom): two sources of content are
    // refused rather than dropping one. `null` and `undefined` are no content;
    // `false` counts, so `{cond && <b />}` refuses when cond is false.
    if (children != null) {
      throw vincleTypeError(
        `[vincle/core] <${tag}> cannot have both children and dangerouslySetInnerHTML: ` +
          "keep one source of content: the children, or the markup in __html.",
        ERR_AMBIGUOUS_HTML_CHILDREN,
      );
    }
    const html = dsih.__html;
    if (typeof html === "string") children = raw(html);
    else if (html === null || html === undefined) children = raw("");
    else
      throw vincleTypeError(
        `[vincle/core] dangerouslySetInnerHTML.__html must be a string (or null/undefined to clear), got ${typeof html}. ` +
          'Pass markup as a string: { __html: "<b>hi</b>" }.',
        ERR_DANGEROUS_HTML,
      );
  }

  return new VNode(tag, props, children);
}

const jsxs = jsx;

/**
 * Classic `createElement(tag, attributes, ...children)`: positional children
 * win over `attributes.children` (an explicit `undefined` overrides). The
 * caller's props are never mutated.
 */
export function createElement(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
  ...children: unknown[]
): VNode {
  if (children.length === 0) return jsx(tag, attributes);
  const props = { ...attributes };
  props["children"] = children.length === 1 ? children[0] : children;
  return jsx(tag, props);
}

function Fragment({ children }: { children?: Renderable }): Renderable {
  return children;
}

// ── Precompile runtime helpers ────────────────────────────────────────────
//
// jsxEscape, jsxAttr, and jsxTemplate support the Deno/Bun-style JSX precompile
// transform (`jsxImportSource: "precompile"`): the transform delegates
// per-value encoding to them.

/**
 * Escape a value for insertion into a JSX template literal.
 *
 * Follows the Deno/Preact precompile contract: a `VNode` passes through, plain
 * values become `RawString`, and values that may read a Provider become
 * `TemplateNode` until the tree walk.
 */
export function jsxEscape(
  v: unknown,
): RawString | VNode | TemplateNode | Promise<RawString | VNode> {
  if (typeof v === "string") return new RawString(escapeContent(v));
  if (v instanceof RawString) return v;
  if (v instanceof VNode) return v;
  if (Array.isArray(v)) return hasDeferredChild(v) ? jsxEscapeDeferred(v) : escapeArray(v);
  if (v !== null && (typeof v === "object" || typeof v === "function")) return jsxEscapeDeferred(v);
  return new RawString(valueToText(v));
}

function hasDeferredChild(values: unknown[]): boolean {
  for (const value of values) {
    if (Array.isArray(value) && hasDeferredChild(value)) return true;
    if (value !== null && value !== undefined && !(value instanceof RawString)) {
      if (typeof value === "object" || typeof value === "function") return true;
    }
  }
  return false;
}

/** Escape a compiler hole without starting a component before its Provider. */
export function jsxEscapeDeferred(
  v: unknown,
): RawString | VNode | TemplateNode | Promise<RawString | VNode> {
  // Objects and functions may run user code during coercion: keep that inside
  // the Provider and after earlier component siblings.
  if (v === null || (typeof v !== "object" && typeof v !== "function") || v instanceof RawString)
    return jsxEscape(v);
  return new TemplateNode((ctx) => {
    const rendered = renderNode(v, ctx);
    return rendered instanceof Promise
      ? rendered.then((text) => new RawString(text))
      : new RawString(rendered);
  });
}

// Single pass, like `renderChildrenAsync`: a three-pass form is several times
// slower on the all-synchronous case. Reached only when no element or
// component hides in the array (`hasDeferredChild`), so the render calls below
// never meet a context-sensitive tree: the HTML default is a formality here.
function escapeArray(arr: unknown[]): RawString | Promise<RawString> {
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    if (typeof value === "string") {
      out += escapeContent(value);
      continue;
    }
    if (value instanceof RawString) {
      out += value.value;
      continue;
    }
    if (value === null || (typeof value !== "object" && typeof value !== "function")) {
      out += valueToText(value);
      continue;
    }
    const part = jsxEscape(value);
    if (part instanceof Promise) {
      return escapeArrayFrom(out, part.then(renderEscaped), arr, i + 1);
    }
    if (part instanceof VNode || part instanceof TemplateNode) {
      const rendered = renderNode(part, HTML_ROOT);
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
 * `pending` must resolve to **final text**: unrendered values would be escaped
 * over finished markup, turning an async component in an array into
 * `&lt;i&gt;two&lt;/i&gt;` on the precompile path only.
 * `{items.map(() => <AsyncComp/>)}` is this shape.
 */
async function escapeArrayFrom(
  prefix: string,
  pending: Promise<string>,
  arr: unknown[],
  from: number,
): Promise<RawString> {
  // Same rule as `renderChildrenFrom`. A synchronous throw becomes a rejection
  // so the remaining elements still start.
  const parts: Array<string | Promise<string>> = [pending];
  for (let i = from; i < arr.length; i++) {
    let part: string | Promise<string>;
    try {
      part = renderValue(arr[i], HTML_ROOT);
    } catch (error) {
      part = Promise.reject(error);
    }
    parts.push(part);
  }
  return new RawString(prefix + (await settleConcurrent(parts)).join(""));
}

/**
 * Which dialect of the precompile contract this runtime speaks.
 *
 * Only `"vincle"` promises that a precompiled page renders the same bytes as
 * the dynamic one, so only then may a transform improve on Deno's output; any
 * other runtime gets it as is. An adapter keeps the dialect by re-exporting
 * everything (`export * from`); a named re-export of the three helpers drops it.
 */
export const precompileDialect = "vincle";

/**
 * Serialize a single attribute to a `name="value"` string fragment: bare, no
 * separating space. Called by the precompile transform for each attribute
 * expression.
 *
 * Bare because the separator lives in the transform's static text, so Deno
 * templates run here. `jsxTemplate` removes the space left by an empty result
 * at assembly time, when it knows it sits inside a start tag.
 *
 * An animation's `attributeName` and the four names it writes through come back
 * as an `ElementAttr`: judging them needs the tag, which only `jsxTemplate` has.
 *
 * The value taxonomy lives in `serializeAttr` (`attrs.ts`), shared with `buildAttrs`.
 */
export function jsxAttr(
  name: string,
  value: unknown,
): RawString | ElementAttr | Promise<RawString | ElementAttr> {
  if (value instanceof Promise) return value.then((v) => jsxAttr(name, v));
  return serializeTemplateAttr(name, value);
}

/**
 * Handle the `jsxTemplate` call from the precompile transform: a tagged
 * template literal that interleaves static template fragments with escaped
 * values and VNodes (components the transform left in place, Deno-style).
 *
 * A VNode hole renders through the tree walk. Holes follow
 * `renderChildrenFrom`: concurrent once one suspends, joined in document
 * order so `appendHole` can read the accumulated prefix. A single pass avoids
 * three traversals and an array for what is usually a two-hole template.
 */
export function jsxTemplate(
  templates: ArrayLike<string>,
  ...values: unknown[]
): RawString | TemplateNode {
  return renderTemplate(templates, values);
}

/**
 * The body `jsxTemplate` and `jsxTemplateDeferred` share.
 *
 * Runs context-free: the holes it bakes eagerly are escaped strings, plain
 * values and attributes, whose bytes are the same in every namespace. A hole
 * that needs the tree walk defers the remainder to a `TemplateNode`, which the
 * walk calls with the parser context at the template's position.
 */
function renderTemplate(templates: ArrayLike<string>, values: unknown[]): RawString | TemplateNode {
  if (values.length === 1 && values[0] instanceof RawString && values[0].value !== "")
    return new RawString((templates[0] ?? "") + values[0].value + (templates[1] ?? ""));
  let out = templates[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    // `RawString` first: almost every hole is one, and the taxonomy below needs ten tests to reach it.
    if (v instanceof RawString) {
      out = appendHole(out, v.value);
    } else if (v === null || v === undefined || typeof v === "boolean") {
      out = appendHole(out, "");
    } else if (isDeferredValue(v)) {
      if (!(v instanceof ElementAttr))
        return new TemplateNode((ctx) =>
          renderTemplateAsync(out, v, values, i + 1, templates, contextAt(ctx, out)),
        );
      const text = renderElementAttr(v, templates, values, i);
      if (typeof text !== "string")
        return new TemplateNode((ctx) =>
          resumeAfter(out, text, values, i, templates, contextAt(ctx, out)),
        );
      out = appendHole(out, text);
    } else {
      out = appendHole(out, valueToText(v));
    }
    out += templates[i + 1] ?? "";
  }
  return new RawString(out);
}

/** Vincle-only precompile helper: preserve component holes until rendering. */
export function jsxTemplateDeferred(
  templates: ArrayLike<string>,
  ...values: unknown[]
): RawString | TemplateNode {
  if (values.length === 1 && Array.isArray(values[0])) {
    const value = values[0];
    const prefix = templates[0] ?? "";
    const suffix = templates[1] ?? "";
    return new TemplateNode((ctx) => {
      const rendered = renderNode(value, contextAt(ctx, prefix));
      const finish = (text: string) => new RawString(appendHole(prefix, text) + suffix);
      return rendered instanceof Promise ? rendered.then(finish) : finish(rendered);
    });
  }
  if (values.length === 1 && values[0] instanceof TemplateNode) {
    const value = values[0];
    const prefix = templates[0] ?? "";
    const suffix = templates[1] ?? "";
    return new TemplateNode((ctx) => {
      const part = value.render(contextAt(ctx, prefix));
      const finish = (result: RawString) =>
        new RawString(appendHole(prefix, result.value) + suffix);
      return part instanceof Promise ? part.then(finish) : finish(part);
    });
  }
  return renderTemplate(templates, values);
}

/**
 * The parser context a deferred template hole stands in: the walk's context at
 * the template's position, moved past the markup the template already emitted.
 * The scan is the price of a template text holding its own `<svg>` root; the
 * precheck keeps it to templates that actually carry one.
 */
function contextAt(ctx: ParseContext, emitted: string): ParseContext {
  return mayTransition(emitted) ? scanTextContext(ctx, emitted) : ctx;
}

/** The context of the hole after `emitted`, when the hole's own output is balanced. */
function scanChunk(ctx: ParseContext, chunk: string): ParseContext {
  return mayTransition(chunk) ? scanTextContext(ctx, chunk) : ctx;
}

/**
 * Append one hole's text, dropping the separator a dropped attribute leaves.
 *
 * `<input ${jsxAttr("value", null)}>` renders `<input>`, the same bytes the
 * runtime path emits. Only an empty hole inside a start tag loses the space:
 * text keeps its spaces (`<p>a ${""}b</p>`), and so does a quoted value
 * (`<div title="a ${""}">`), hence the quote count.
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

/** Continue a template once the attribute at `hole` has resolved to its final text. */
function resumeAfter(
  prefix: string,
  text: Promise<string>,
  values: unknown[],
  hole: number,
  templates: ArrayLike<string>,
  ctx: ParseContext,
): RawString | Promise<RawString> {
  return renderTemplateAsync(prefix, text.then(raw), values, hole + 1, templates, ctx);
}

/**
 * A hole the synchronous path can't finish alone: a `VNode`, a `Promise`, or a
 * container that may hold one. Same taxonomy as `jsxEscape`; an array holding a
 * `VNode` is where they would diverge, and this public export lets a caller build one.
 */
function isDeferredValue(v: unknown): boolean {
  return (
    v instanceof TemplateNode ||
    v instanceof Promise ||
    v instanceof VNode ||
    Array.isArray(v) ||
    isIterable(v) ||
    isAsyncIterable(v) ||
    (v !== null && (typeof v === "object" || typeof v === "function"))
  );
}

/**
 * Finish a template whose hole at `from - 1` deferred. `ctx` is that hole's
 * parser context; each later hole's context comes from the static chunk before
 * it, a hole's own output counting as namespace-balanced.
 */
function renderTemplateAsync(
  prefix: string,
  first: unknown,
  values: unknown[],
  from: number,
  templates: ArrayLike<string>,
  ctx: ParseContext,
): RawString | Promise<RawString> {
  const renderAt = (v: unknown, i: number, holeCtx: ParseContext): string | Promise<string> =>
    v instanceof ElementAttr
      ? renderElementAttr(v, templates, values, i)
      : v instanceof Promise
        ? v.then((r: unknown) => renderAt(r, i, holeCtx))
        : renderValue(v, holeCtx);
  const firstPart = renderAt(first, from - 1, ctx);
  const finishFirst = (text: string) =>
    new RawString(appendHole(prefix, text) + (templates[from] ?? ""));
  if (from === values.length)
    return typeof firstPart === "string" ? finishFirst(firstPart) : firstPart.then(finishFirst);
  // Concurrent tail, same rule as `renderChildrenFrom`. `appendHole` runs at
  // join time: it reads the accumulated prefix, which only exists in order.
  const parts: Array<string | Promise<string>> = [firstPart];
  let holeCtx = scanChunk(ctx, templates[from] ?? "");
  for (let i = from; i < values.length; i++) {
    let part: string | Promise<string>;
    try {
      part = renderAt(values[i], i, holeCtx);
    } catch (error) {
      part = Promise.reject(error);
    }
    parts.push(part);
    holeCtx = scanChunk(holeCtx, templates[i + 1] ?? "");
  }
  return (async () => {
    const texts = await settleConcurrent(parts);
    let out = prefix;
    for (let j = 0; j < texts.length; j++) {
      out = appendHole(out, texts[j]!) + (templates[from + j] ?? "");
    }
    return new RawString(out);
  })();
}

/**
 * One template hole to final text: a `VNode` through the tree walk, a promise
 * awaited recursively, and anything else through `valueToText` (escape.ts).
 * Containers delegate to `renderNode` so `jsxTemplate` and `jsxEscape` agree;
 * see `isDeferredValue`.
 */
function renderValue(v: unknown, ctx: ParseContext): string | Promise<string> {
  if (v instanceof TemplateNode) {
    const rendered = v.render(ctx);
    return rendered instanceof Promise ? rendered.then((value) => value.value) : rendered.value;
  }
  if (v instanceof Promise) return v.then((r) => renderValue(r, ctx));
  if (v instanceof VNode) return renderNode(v, ctx);
  if (Array.isArray(v) || isIterable(v) || isAsyncIterable(v)) return renderNode(v, ctx);
  return valueToText(v);
}

/** The two shapes `jsxEscape` can settle to, reduced to final text. */
function renderEscaped(v: RawString | VNode | TemplateNode): string | Promise<string> {
  return v instanceof RawString ? v.value : renderNode(v, HTML_ROOT);
}

/** Context for the rare eager render in `escapeArray`, which no VNode reaches. */
const HTML_ROOT: ParseContext = { ns: "html", tag: "", parent: null };

export { jsx, jsxs, Fragment };
export type { VNode } from "./types.js";

// TypeScript resolves `JSX.*` from the module named in `jsxImportSource`;
// declared once in `./jsx-namespace.ts`.
export type { JSX } from "./jsx-namespace.js";
