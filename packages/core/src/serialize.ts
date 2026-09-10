/**
 * Static serialization: an element whose subtree is already final becomes HTML at
 * construction time, instead of a `VNode` the tree walk reads back later.
 *
 * Three depths, one rule — `null` bails, and means "this renders later":
 *
 *   serializeStatic   one element and everything under it
 *   serializeContent  an element's children, into the string between its tags
 *   serializeChild    one child
 *
 * `serializeElement` writes one element's bytes and is the only thing here that
 * cannot bail: it is given parts that are already final. The tree walk in
 * `render.ts` calls it too, which is what keeps the two paths emitting the same
 * document.
 *
 * @module
 */

import { buildAttrs } from "./attrs.js";
import { ERR_VOID_CHILDREN, vincleTypeError } from "./errors.js";
import { isAsyncIterable, isIterable, isRawtextTag, renderLeaf } from "./escape.js";
import { ownChildren } from "./props.js";
import { isVoidElement, voidChildrenMessage } from "./tag.js";
import { RawString, VNode } from "./types.js";

// The tag-name vocabulary lives in `tag.ts` (a leaf module the door,
// `jsx-runtime.ts`, and this module both import) and is re-exported here, where
// `./html` and the tests already look for it.
export { isValidTag, invalidTagMessage, isVoidElement, voidChildrenMessage } from "./tag.js";

/**
 * Write one element: a tag around parts that are already final.
 *
 * Any divergence in void-element handling or tag wrapping is a bug to fix here,
 * once, rather than in each of the two callers.
 *
 * Two writers rather than one that asks: whether a tag closes is settled when
 * the element is constructed, and asking again here would be a second
 * classification of the same name on every element. `serializeVoidElement`
 * cannot be handed content, which is the refusal made unrepresentable rather
 * than checked.
 */
export function serializeElement(tag: string, attrStr: string, content: string): string {
  return `<${tag}${attrStr}>${content}</${tag}>`;
}

/** Write one void element: a tag that closes nothing. */
export function serializeVoidElement(tag: string, attrStr: string): string {
  return `<${tag}${attrStr}>`;
}

// Children are walked once: the bail happens the instant one of them is
// dynamic, rather than detecting first and rendering after.
//
// The bail is `null` all the way out, the return value itself: nothing allocated
// to carry it, no state for a props getter re-entering the static path to share,
// and one answer to recognise rather than a sentinel per depth.

/**
 * Serialize `<tag …props>` to final HTML, or bail with `null` when a child is
 * dynamic.
 *
 * The tag name arrives judged: `jsx()` is the one door in, and this function is
 * not reachable from outside the package, so there is no second way an element
 * gets here unexamined. The void check stays — this path never builds a `VNode`,
 * so the door's check never runs for it — and its answer is needed anyway, to
 * know whether the tag closes.
 *
 * What this deliberately does *not* do, because a second opinion on it is how
 * the static path and the tree walk drift apart:
 *
 * - **Judge the props.** `buildAttrs`, called below, is the authority on
 *   serializing props, and it handles every shape this path might be suspected of
 *   not handling: a style object, a class array, a promised value. A scan for
 *   them here costs a pass over every attribute of every element, calls every
 *   getter in the props twice, and sends `<div style={{…}}>` and `class={[…]}`
 *   down the slow path for nothing.
 *   `dangerouslySetInnerHTML` is the one prop shape that really is invisible here
 *   — it replaces the children this walk reads from `props` — and `jsx()` keeps
 *   that one to itself.
 */
export function serializeStatic(
  tag: string,
  props: Record<string, unknown>,
): RawString | Promise<RawString> | null {
  // `ownChildren` (props.ts) owns what an inherited `children` means; asking it
  // is what costs, at one call per element — 4% of a page of static markup — so
  // the condition that makes it worth asking is named and tested here.
  const prototypeCarriesChildren = "children" in Object.prototype;
  const children = prototypeCarriesChildren ? ownChildren(props) : props["children"];
  const isVoid = isVoidElement(tag);
  // The door (`jsx-runtime.ts`) repeats this same condition on the VNode path —
  // keep the two in sync; `path-equivalence.test.ts` fuzzes the agreement.
  if (isVoid && children !== undefined)
    throw vincleTypeError(voidChildrenMessage(tag), ERR_VOID_CHILDREN);
  const childTag = isRawtextTag(tag) ? tag : undefined;

  // Children first: a dynamic child is the only reason to decline, and declining
  // before `buildAttrs` runs is what keeps a promised attribute from being
  // started and then dropped on the floor.
  const content = serializeContent(children, childTag);
  if (content === null) return null;

  const attrStr = buildAttrs(props);
  // A promised attribute value does not make a subtree dynamic — it makes the
  // *serialized result* awaitable, which `JSX.Element` has always allowed. Doing
  // it here rather than falling back to a VNode keeps one serializer for one
  // element, whatever its attributes turn out to be.
  if (typeof attrStr !== "string") {
    return attrStr.then(
      (resolved) =>
        new RawString(
          isVoid ? serializeVoidElement(tag, resolved) : serializeElement(tag, resolved, content),
        ),
    );
  }
  return new RawString(
    isVoid ? serializeVoidElement(tag, attrStr) : serializeElement(tag, attrStr, content),
  );
}

/** An element's children, serialized into the string that goes between its tags. */
function serializeContent(children: unknown, rawtextTag: string | undefined): string | null {
  if (!Array.isArray(children)) return serializeChild(children, rawtextTag);
  let out = "";
  for (let i = 0; i < children.length; i++) {
    const part = serializeChild(children[i], rawtextTag);
    if (part === null) return null;
    out += part;
  }
  return out;
}

/** One child, serialized to the text it contributes. */
function serializeChild(child: unknown, rawtextTag: string | undefined): string | null {
  // The two tests `renderNode` opens with, for the same reason. A non-object is
  // a leaf by construction. `RawString` is the object this path hands itself
  // back, one per nested element, and the only hot shape that reaches
  // `isIterable` / `isAsyncIterable` — everything else short-circuits on their
  // `typeof` test before the `Symbol` lookup. Worth 7.0% on `stack` and 4.6% on
  // `realworld`.
  if (typeof child !== "object" || child === null) {
    // A function is not an object either; its decline moves here with it.
    return typeof child === "function" ? null : renderLeaf(child, rawtextTag);
  }
  if (child instanceof RawString) return child.value;

  if (Array.isArray(child)) return serializeContent(child, rawtextTag);
  // The only decision this path makes: anything that renders later cannot be
  // serialized now.
  if (
    child instanceof VNode ||
    child instanceof Promise ||
    isIterable(child) ||
    isAsyncIterable(child)
  ) {
    return null;
  }
  return renderLeaf(child, rawtextTag);
}
