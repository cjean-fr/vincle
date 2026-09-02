import { buildAttrs } from "./attrs.js";
import {
  escapeContent,
  escapeRawTagContent,
  isAsyncIterable,
  isIterable,
  isRawtextTag,
  valueToText,
} from "./escape.js";
import { VOID_ELEMENTS, invalidTagMessage, isValidTag, voidChildrenMessage } from "./tag.js";
import { RawString, VNode } from "./types.js";

// The tag-name vocabulary lives in `tag.ts` (a leaf module the `VNode`
// constructor can import) and is re-exported here, where `./html` and the tests
// already look for it.
export { VOID_ELEMENTS, isValidTag, invalidTagMessage } from "./tag.js";

/**
 * Single source of truth for serializing one HTML element to a string.
 *
 * Shared by the eager static fast-path and the VNode tree walk so both paths
 * emit byte-identical markup. Any divergence in void-element handling or tag
 * wrapping is a bug — it must be fixed here, once, not in each caller.
 */

export function serializeElement(tag: string, attrStr: string, content: string): string {
  if (VOID_ELEMENTS.has(tag)) {
    // The rendered `content`, not "were there children": `<img>{null}</img>` and
    // `<br>{cond && <b/>}</br>` have children that render to nothing, which is
    // the shape every conditional child takes. What no HTML parser can
    // represent is *content* between a void element and its closing tag — it
    // drops the tag and reparents the content, so the document silently stops
    // being the one that was written. Refusing it is the only answer that keeps
    // the output the tree.
    if (content !== "") throw new TypeError(voidChildrenMessage(tag));
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
 * The tag name is validated here because this is one of the two ways an element
 * leaves `jsx()`: the other is a `VNode`, which validates in its constructor.
 * One check per element on either path — the check used to sit in `jsx()`, above
 * the fork, which is the same single check but leaves a hand-built `VNode`
 * unguarded.
 *
 * What this deliberately does *not* do, because a second opinion on it is how
 * the fold and the tree walk drift apart:
 *
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
  if (!isValidTag(tag)) throw new TypeError(invalidTagMessage(tag));

  let children = props["children"];
  if (children !== undefined && "children" in Object.prototype && !Object.hasOwn(props, "children"))
    children = undefined;
  const childTag = isRawtextTag(tag) ? tag : undefined;

  // Children first: a dynamic child is the only reason to decline, and declining
  // before `buildAttrs` runs is what keeps a promised attribute from being
  // started and then dropped on the floor.
  const state: FoldState = { dynamic: false };
  const content = foldChildren(children, childTag, state);
  if (state.dynamic) return NOT_STATIC;

  const attrStr = buildAttrs(props);
  // A promised attribute value does not make a subtree dynamic — it makes the
  // *folded result* awaitable, which `JSX.Element` has always allowed. Folding
  // it here rather than falling back to a VNode keeps one serializer for one
  // element, whatever its attributes turn out to be.
  if (typeof attrStr !== "string") {
    return attrStr.then((resolved) => new RawString(serializeElement(tag, resolved, content)));
  }
  return new RawString(serializeElement(tag, attrStr, content));
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
