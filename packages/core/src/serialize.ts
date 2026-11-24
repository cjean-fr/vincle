/**
 * Element writers shared by the tree walk: the single renderer.
 *
 * `serializeElement` writes one element's bytes and is the only thing here that
 * cannot bail: it is given parts that are already final.
 *
 * @module
 */

export { isValidTag, invalidTagMessage, isVoidElement, voidChildrenMessage } from "./tag.js";

/**
 * Write one element: a tag around parts that are already final.
 *
 * Any divergence in void-element handling or tag wrapping is a bug to fix here,
 * once, rather than in the renderer.
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
