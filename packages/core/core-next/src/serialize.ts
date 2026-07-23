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

// ── Tag name validation ─────────────────────────────────────────────────────
// A tag is invalid if empty, starts with `!`/`?` (comment/PI), or contains
// whitespace, a control char, or any of ` " ' < > / = \` \` — the characters
// that would break out of the start tag. Cached: tag names are a tiny, bounded
// set, so the regex runs at most once per distinct tag.
const RE_INVALID_TAG = /^[!?]|[\s"'<>/=`\\]|\p{C}/u;
const TAG_VALID_CACHE = new Map<string, boolean>();

export function isValidTag(tag: string): boolean {
  let valid = TAG_VALID_CACHE.get(tag);
  if (valid === undefined) {
    valid = tag.length > 0 && !RE_INVALID_TAG.test(tag);
    TAG_VALID_CACHE.set(tag, valid);
  }
  return valid;
}

/** Thrown by the renderers for an invalid tag name — kept out of line so the
 * cold error construction never sits in the hot render path. */
export function invalidTagError(tag: string): TypeError {
  return new TypeError(
    `[vincle/core] Invalid tag name ${JSON.stringify(tag)}: a tag name must not be empty, ` +
      'start with "!" or "?", or contain whitespace, control characters, or any of " \' < > / = ` \\.',
  );
}

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
