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
 * Does this element write one attribute's value onto another?
 *
 * A switch, for the same reason and with the same measurement as
 * {@link isVoidElement} above: a per-element tag question must not hash, and
 * this one is asked on every element `buildAttrs` serializes.
 *
 * Case-insensitive, as the browser is: the tokenizer lowercases a tag name
 * before foreign content adjusts it, so `<aNIMATE>` and `<animateMotion>` are
 * the same element as `<animate>` and `<animatemotion>`. The first character and
 * the length reject almost every tag before the lowercased copy is made.
 *
 * A closed list, and the only one a browser recognises: an element outside it
 * does not animate anything, whatever its attributes say. That closedness is
 * what lets the URL check be scoped to these five names instead of applied
 * everywhere — `<div to="javascript:…">` is as inert as `<div id="javascript:…">`,
 * and filtering it would be the same category error as filtering that.
 *
 * @see https://www.w3.org/TR/SVG11/animate.html
 */
export function isAnimationTag(tag: string): boolean {
  const c0 = tag.charCodeAt(0) | 32;
  if (c0 !== 97 && c0 !== 115) return false; // 'a', 's'
  const n = tag.length;
  if (n !== 7 && n !== 3 && n !== 12 && n !== 13 && n !== 16) return false;
  switch (tag.toLowerCase()) {
    case "animate":
    case "set":
    case "animatetransform":
    case "animatemotion":
    // SVG 1.1 only, dropped from SVG 2, still parsed by every engine: listed so
    // that forgetting it cannot be the way through.
    case "animatecolor":
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
