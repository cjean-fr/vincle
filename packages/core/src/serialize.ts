/**
 * Element serialization: writing one element's bytes around parts that are
 * already final. The tree walk in `render.ts` is the only caller.
 *
 * The tag-name vocabulary lives in `tag.ts` (a leaf module the door,
 * `jsx-runtime.ts`, and this module both import) and is re-exported here, where
 * `./html` and the tests already look for it.
 *
 * @module
 */

// The tag-name vocabulary lives in `tag.ts`, re-exported here for `./html` and the tests.
export { isValidTag, invalidTagMessage, isVoidElement, voidChildrenMessage } from "./tag.js";

/**
 * Write one element: a tag around parts that are already final.
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
