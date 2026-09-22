/**
 * Tag vocabulary: what a tag may be called, and whether it closes itself.
 *
 * A leaf module on purpose: it imports nothing. The door, `jsx-runtime.ts`,
 * validates with these answers, and `serialize.ts` re-exports them for the
 * `./html` barrel, which is what imports `serialize.ts`. The answers cannot
 * live in the door without a cycle, so they live here, one leaf both import.
 *
 * @module
 */

// `\p{C}` under `/u` drags in Unicode tables, so valid names are memoised in a
// `Set`: cheaper per hit than a `Map` on this hot path, and there's no value to
// dereference. Invalid names aren't cached: they throw, so re-paying the regex
// on the way out costs nothing anyone waits for.
//
// The scan below runs before the memo, not after: scanning a tag name costs
// less than a hash lookup, which is a call into a builtin: 5 to 9% across both
// engines on `stack` and `realworld`.
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
    `[vincle/core] Invalid tag name ${JSON.stringify(tag)}: must be a plain name like "div": ` +
    "not empty, and no leading ! or ?, whitespace, control characters, or \" ' < > / = ` \\ ."
  );
}

/**
 * Does this tag close itself? A switch, not a `Set`: the list is fixed by the
 * spec, it is asked on every element, and a string switch compares: the tag
 * name is never hashed. Measured against the `Set` it replaced: +4.5% on `text`
 * under bun, +6.2% on `realworld` under node (8 runs each), and no movement
 * anywhere else.
 *
 * @see https://html.spec.whatwg.org/multipage/syntax.html#void-elements
 */
export function isVoidElement(tag: string): boolean {
  switch (tag) {
    case "area":
    case "base":
    case "br":
    case "col":
    case "embed":
    case "hr":
    case "img":
    case "input":
    case "link":
    case "meta":
    case "param":
    case "source":
    case "track":
    case "wbr":
      return true;
    default:
      return false;
  }
}

/**
 * A void element was given children. One message for both paths, and
 * for whichever of the two the caller happens to hit first.
 */
export function voidChildrenMessage(tag: string): string {
  return `[vincle/core] <${tag}> is a void element and cannot have children: move the content next to it, not inside.`;
}
