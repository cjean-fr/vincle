/**
 * Single source of truth for serializing one HTML element to a string.
 *
 * Shared by the eager static fast-path (`static-render.ts`) and the VNode
 * tree walk (`create-element.ts`) so both paths emit byte-identical markup.
 * Any divergence in void-element handling or tag wrapping is a bug — it must
 * be fixed here, once, not in each caller.
 */

/**
 * HTML void elements. Rendered **without** a closing tag and **without** a
 * trailing slash (`<br>`, not `<br/>`), matching `@vincle/core` — canonical
 * HTML5, email-safe, one byte smaller.
 *
 * @see https://html.spec.whatwg.org/multipage/syntax.html#void-elements
 */
export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Serialize a single element from its tag, pre-built attribute string, and
 * already-rendered inner HTML.
 *
 * @param tag         validated tag name
 * @param attrStr     attribute string, leading-space included (from `buildAttrs`)
 * @param content     already-rendered inner HTML (escaped by the caller)
 * @param hasChildren whether the element had any children — a void element
 *                    with no children collapses to a start tag only
 */
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
