import { buildAttrs } from "./attrs.js";
import {
  escapeContent,
  escapeRawTagContent,
  isAsyncIterable,
  isIterable,
  isRawtextTag,
  valueToText,
} from "./escape.js";
import { RawString, VNode } from "./types.js";

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

// `\p{C}` under `/u` drags in Unicode tables, so valid names are memoised in a
// `Set` — cheaper per hit than a `Map` on this hot path, and there's no value to
// dereference. Invalid names aren't cached: they throw, so re-paying the regex
// on the way out costs nothing anyone waits for.
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
    'start with "!" or "?", or contain whitespace, control characters, or any of " \' < > / = ` \\ . ' +
    'If the tag is computed, check the expression that produced it — it must be a plain tag name like "div", not a component or an undefined value.'
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

// `tryRenderStatic` folds an element subtree to a RawString in one traversal,
// bailing to `NOT_STATIC` the instant a child is dynamic — children are walked
// once, not detected then rendered separately.
//
// The bail is a `FoldState` object passed by reference, not a `string | symbol`
// union return, so `foldChild` stays monomorphic on this deep-recursion hot
// path. Allocated per outermost call rather than a module-level flag, so two
// invocations on the same stack don't share state.

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

  // `children !== undefined`, matching the tree-walk in `render.ts` — `!!children`
  // diverged on a falsy child of a void element (`<img>{0}</img>` folded to
  // `<img>` but tree-walked to `<img>0</img>`).
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
  // Frequency order; the leaf taxonomy delegates to `valueToText` (escape.ts),
  // keeping inline only what rawtext escaping or frequency pays for.
  if (typeof child === "string") {
    return rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
  }
  if (child instanceof RawString) return child.value;
  if (Array.isArray(child)) return foldChildren(child, rawtextTag, state);
  if (child === null || child === undefined || typeof child === "boolean") return "";
  if (
    child instanceof VNode ||
    child instanceof Promise ||
    typeof child === "function" ||
    isIterable(child) ||
    isAsyncIterable(child)
  ) {
    state.dynamic = true;
    return "";
  }
  // Same rule as `renderRawtextChild` in `render.ts`, and it has to be the same
  // or the fold and the walk disagree on one leaf: inside rawtext the coercion
  // is `String`, because HTML-escaping there corrupts the sub-language.
  return rawtextTag === undefined
    ? valueToText(child)
    : escapeRawTagContent(String(child), rawtextTag);
}
