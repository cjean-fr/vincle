/**
 * Tag-name vocabulary: what a tag may be called, and which tags hold nothing.
 *
 * A leaf module on purpose — it imports nothing. `types.ts` validates a tag in
 * the `VNode` constructor, and `types.ts` is what `serialize.ts` imports, so
 * these three answers cannot live in `serialize.ts` without making that pair a
 * cycle.
 *
 * @module
 */

/**
 * HTML void elements. Rendered **without** a closing tag and **without** a
 * trailing slash (`<br>`, not `<br/>`) — canonical HTML5, email-safe, one byte
 * smaller.
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

/**
 * A void element was given children. One message for the fold and the walk, and
 * for whichever of the two the caller happens to hit first.
 */
export function voidChildrenMessage(tag: string): string {
  return (
    `[vincle/core] <${tag}> is a void element and cannot have children, but content was rendered into it. ` +
    "An HTML parser drops the closing tag and reparents that content, so the document would not be the one written. " +
    `Move the content next to <${tag}> rather than inside it.`
  );
}
