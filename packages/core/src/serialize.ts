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

// A tag name can be caller-supplied (`<Tag>` driven by data), so the memo must
// not grow without bound. Past the cap, validation still happens — just uncached.
const VALID_TAGS_MAX = 1024;

export function isValidTag(tag: string): boolean {
  // Fast path, and a proof rather than a guess: none of the forbidden
  // characters is an ASCII lowercase letter — not `!?`, not `\s"'<>/=\`\\`, and
  // `\p{C}` matches no letter either. A name made only of `a`–`z` is therefore
  // valid, and saying so takes a few charCode comparisons instead of a hash
  // lookup. That matters: this runs once per element, and on a deep tree it is
  // the most repeated work in the renderer. Every HTML element name qualifies.
  //
  // Do NOT widen this scan to digits and `-` to keep `<h1>` or `<my-element>` on
  // the fast path. It was tried and measured (intra-run, n=8): slower on every
  // vocabulary — noticeably so on the very web-component names it was meant to
  // rescue. Leaving the scan on the second character and hitting `VALID_TAGS`
  // costs less than scanning a nine-character name to the end, because a `Set`
  // lookup on an interned string is cheap and a per-character test is not. The
  // memo below is the fast path for those names, not a penalty.
  const len = tag.length;
  if (len === 0) return false;
  let i = 0;
  while (i < len) {
    const c = tag.charCodeAt(i);
    if (c < 97 || c > 122) break;
    i++;
  }
  if (i === len) return true;

  // Anything else — `<h1>`, custom elements, namespaced names (`svg:rect`),
  // non-ASCII, a capitalised name arriving through a data-driven tag, anything
  // invalid — goes here. The regex stays the single authority. Positives are
  // memoised because the regex is expensive (`\p{C}` under `/u` walks Unicode
  // tables); negatives are not, because they throw.
  if (VALID_TAGS.has(tag)) return true;
  if (RE_INVALID_TAG.test(tag)) return false;
  if (VALID_TAGS.size < VALID_TAGS_MAX) VALID_TAGS.add(tag);
  return true;
}

/**
 * The one wording for a rejected tag name. Every path that validates a tag —
 * the static fold and both tree walks — reports it identically, so a developer
 * never has to wonder which renderer they hit.
 */
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
