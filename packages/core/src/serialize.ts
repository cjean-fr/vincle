import { buildAttrs } from "./attrs.js";
import { escapeContent, escapeRawTagContent, isRawtextTag } from "./escape.js";
import { RawString } from "./types.js";

/**
 * Single source of truth for serializing one HTML element to a string.
 *
 * Shared by the eager static fast-path and the VNode tree walk so both paths
 * emit byte-identical markup. Any divergence in void-element handling or tag
 * wrapping is a bug — it must be fixed here, once, not in each caller.
 */

/**
 * HTML void elements. Rendered **without** a closing tag and **without** a
 * trailing slash (`<br>`, not `<br/>`), matching `@vincle/core` — canonical
 * HTML5, email-safe, one byte smaller.
 *
 * @see https://html.spec.whatwg.org/multipage/syntax.html#void-elements
 */
export const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// ── Tag name validation ────────────────────────────────────────────
//
// `\p{C}` under `/u` drags in Unicode tables, so the regex is memoised — but a
// `Map` is the wrong shape here. This runs once per element on the fold's hot
// path, where a deep tree makes it the most-repeated lookup in the renderer,
// and a `Set.has` hit is measurably cheaper than a `Map.get` that returns an
// object to dereference (bench `stack`: 2.36k vs 2.00k ops/s for the Map form).
// Only positives are memoised: an invalid name throws, so paying the regex
// again on the way out costs nothing anyone waits for.
const RE_INVALID_TAG = /^[!?]|[\s"'<>/=`\\]|\p{C}/u;

const VALID_TAGS = new Set<string>();
const VALID_TAGS_MAX = 1024;

export function isValidTag(tag: string): boolean {
  const len = tag.length;
  if (len === 0) return false;
  let i = 0;
  while (i < len) {
    const c = tag.charCodeAt(i);
    if (c < 97 || c > 122) break;
    i++;
  }
  if (i === len) return true;

  if (VALID_TAGS.has(tag)) return true;
  if (RE_INVALID_TAG.test(tag)) return false;
  if (VALID_TAGS.size < VALID_TAGS_MAX) VALID_TAGS.add(tag);
  return true;
}

export function invalidTagMessage(tag: string): string {
  return (
    `[vincle/core] Invalid tag name ${JSON.stringify(tag)}: a tag name must not be empty, ` +
    'start with "!" or "?", or contain whitespace, control characters, or any of " \' < > / = ` \\.'
  );
}

export function serializeElement(
  tag: string,
  attrStr: string,
  content: string,
  hasChildren: boolean,
): string {
  if (!hasChildren && VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrStr}>`;
  }
  return `<${tag}${attrStr}>${content}</${tag}>`;
}

// ── Static fold — single-pass subtree pre-render ──────────────────────────
//
// `tryRenderStatic` renders an element subtree to a RawString in one traversal:
// it emits HTML as it walks and bails to `NOT_STATIC` the instant it meets a
// dynamic child (a VNode, a promise, a function, an iterable). This replaces the
// old detect-then-render design (`isStaticChild` walk + `renderFlatChildren`
// walk) — children are traversed once, not twice.
//
// The bail is signalled through a `FoldState` object passed by reference rather
// than a `string | symbol` union return, so `foldChild` stays monomorphic (a
// union return deoptimises the deep-recursion hot path). The object is allocated
// once per outermost `tryRenderStatic` call — unlike the previous module-level
// `let hasDynamic` flag, this design is re-entrant safe: two invocations on the
// same stack don't share state.

/** Sentinel returned by `tryRenderStatic` when the subtree cannot be folded. */
export const NOT_STATIC = Symbol("not-static");

interface FoldState {
  dynamic: boolean;
}

/**
 * Fold `<tag …props>` to final HTML, or `NOT_STATIC` when a child is dynamic.
 *
 * Two things this deliberately does *not* do, because a second opinion on either
 * one is how the fold and the tree walk drift apart:
 *
 * - **Validate the tag name.** `jsx()` does it, once, and `jsx()` is the only
 *   caller this function has.
 * - **Judge the props.** There used to be a `for…in` over every prop looking for
 *   shapes the fold supposedly could not handle. `buildAttrs`, called below, is
 *   the authority on serializing props, and it handled all of them: a style
 *   object, a class array, a promised value. The scan cost a pass over every
 *   attribute of every element, called every getter in the props twice, and sent
 *   `<div style={{…}}>` and `class={[…]}` down the slow path for nothing.
 *   `dangerouslySetInnerHTML` is the one prop shape that really is invisible here
 *   — it replaces the children this walk reads from `props` — and `jsx()` keeps
 *   that one to itself.
 */
export function tryRenderStatic(
  tag: string,
  props: Record<string, unknown>,
): RawString | Promise<RawString> | typeof NOT_STATIC {
  const children = props["children"];
  const childTag = isRawtextTag(tag) ? tag : undefined;

  // Children first: a dynamic child is the only reason to decline, and declining
  // before `buildAttrs` runs is what keeps a promised attribute from being
  // started and then dropped on the floor.
  const state: FoldState = { dynamic: false };
  const content = foldChildren(children, childTag, state);
  if (state.dynamic) return NOT_STATIC;

  // `children !== undefined`, not `!!children` — the tree-walk in `render.ts`
  // uses the former, and any other predicate here reopens a hole the fold is
  // supposed to be indistinguishable from it. `!!children` diverged on every
  // falsy child of a void element:
  //   <img>{0}</img>  →  fold "<img>"  vs  tree-walk "<img>0</img>"
  //   <img>{""}</img> →  fold "<img>"  vs  tree-walk "<img></img>"
  // `path-equivalence.test.ts` missed it because it only ever generated void
  // elements without children; it now generates them with children too.
  const hasChildren = children !== undefined;

  const attrStr = buildAttrs(props);
  // A promised attribute value does not make a subtree dynamic — it makes the
  // *folded result* awaitable, which `JSX.Element` has always allowed. Folding
  // it here rather than falling back to a VNode keeps one serializer for one
  // element, whatever its attributes turn out to be.
  if (typeof attrStr !== "string") {
    return attrStr.then(
      (resolved) => new RawString(serializeElement(tag, resolved, content, hasChildren)),
    );
  }
  return new RawString(serializeElement(tag, attrStr, content, hasChildren));
}

function foldChildren(children: unknown, rawtextTag: string | undefined, state: FoldState): string {
  if (!Array.isArray(children)) return foldChild(children, rawtextTag, state);
  let out = "";
  for (let i = 0; i < children.length; i++) {
    out += foldChild(children[i], rawtextTag, state);
    if (state.dynamic) return "";
  }
  return out;
}

function foldChild(child: unknown, rawtextTag: string | undefined, state: FoldState): string {
  if (child === null || child === undefined || typeof child === "boolean") return "";
  if (typeof child === "string") {
    return rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
  }
  if (typeof child === "number") return String(child);
  if (child instanceof RawString) return child.value;
  if (Array.isArray(child)) return foldChildren(child, rawtextTag, state);
  state.dynamic = true;
  return "";
}
