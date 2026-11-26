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

// ── Foreign content ──────────────────────────────────────────────────────

/** Where an element's children are parsed: HTML, or the SVG or MathML foreign rules. */
export const NS_HTML = 0;
export const NS_SVG = 1;
export const NS_MATH = 2;
export type Namespace = typeof NS_HTML | typeof NS_SVG | typeof NS_MATH;

/**
 * Which parsing rules read the children of `<tag>`, given the rules that read
 * the element itself.
 *
 * The HTML parser reads the text of a `<script>` or `<style>` as raw text, but
 * only in the HTML namespace. Under `<svg>` and `<math>` the same text is read
 * as markup: a `<` opens a tag and `&` starts a character reference. The
 * renderer therefore has to know which side of that line an element is on. An
 * element is foreign from the `<svg>` or `<math>` that opens it, back to HTML
 * at an integration point, and foreign again at the next `<svg>` or `<math>`.
 *
 * Follows the tree builder, which only ever switches namespace in three ways:
 *  - `<svg>` and `<math>` start foreign content, but only from the HTML rules.
 *    Inside foreign content they are ordinary elements of the enclosing one;
 *  - the SVG HTML integration points `foreignObject`, `desc`, `title`;
 *  - the MathML text integration points `mi`, `mo`, `mn`, `ms`, `mtext`, and
 *    `annotation-xml` when its `encoding` is `text/html` or `application/xhtml+xml`.
 * The tokenizer lowercases tag names before any of this, so the comparison does.
 *
 * The one direction this may get wrong is over-escaping: an HTML element such
 * as `<div>` inside `<svg>` makes the parser leave foreign content, and this
 * keeps reading it as foreign. Escaped text in a rawtext element is wrong but
 * inert. The reverse, rawtext where the parser reads markup, is the hole this
 * exists to close, and it is never answered here.
 *
 * @param attrs only read for `annotation-xml`.
 * @see https://html.spec.whatwg.org/multipage/parsing.html#tree-construction-dispatcher
 */
export function childNamespace(
  tag: string,
  attrs: Readonly<Record<string, unknown>> | undefined,
  ns: Namespace,
): Namespace {
  if (ns === NS_HTML) {
    // Char codes, not `toLowerCase`: this is asked of every 3 and 4 letter tag.
    const n = tag.length;
    if (n === 3) {
      return (tag.charCodeAt(0) | 32) === 115 &&
        (tag.charCodeAt(1) | 32) === 118 &&
        (tag.charCodeAt(2) | 32) === 103
        ? NS_SVG
        : NS_HTML;
    }
    if (n === 4) {
      return (tag.charCodeAt(0) | 32) === 109 &&
        (tag.charCodeAt(1) | 32) === 97 &&
        (tag.charCodeAt(2) | 32) === 116 &&
        (tag.charCodeAt(3) | 32) === 104
        ? NS_MATH
        : NS_HTML;
    }
    return NS_HTML;
  }
  const lower = tag.toLowerCase();
  if (ns === NS_SVG) {
    return lower === "foreignobject" || lower === "desc" || lower === "title" ? NS_HTML : NS_SVG;
  }
  switch (lower) {
    case "mi":
    case "mo":
    case "mn":
    case "ms":
    case "mtext":
      return NS_HTML;
    case "annotation-xml":
      return hasHtmlEncoding(attrs) ? NS_HTML : NS_MATH;
    default:
      return NS_MATH;
  }
}

function hasHtmlEncoding(attrs: Readonly<Record<string, unknown>> | undefined): boolean {
  if (attrs === undefined) return false;
  for (const key in attrs) {
    if (key.toLowerCase() !== "encoding") continue;
    const value = attrs[key];
    if (typeof value !== "string") return false;
    const v = value.toLowerCase();
    return v === "text/html" || v === "application/xhtml+xml";
  }
  return false;
}
