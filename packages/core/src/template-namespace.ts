import { childNamespace, isVoidElement, NS_HTML, type Namespace } from "./tag.js";

/**
 * Which parsing rules read a template hole.
 *
 * A template is markup text with holes: `jsxTemplate`'s static strings are
 * trusted bytes, so a `<svg>` written there reaches the renderer as characters,
 * not as an element. A `<script>` or `<style>` that arrives through a hole needs
 * the rules of the spot it lands in, and only the text around the hole says
 * which. This reads the static strings once, with the same element rules as
 * `childNamespace`, and answers for every hole.
 *
 * The strings are compiler output or an author's literal, so the reading is
 * the one a template tag allows: balanced tags, quoted attribute values, no
 * comments to speak of. A start tag split by an attribute hole is followed
 * across it. The text inside a `<script>` or `<style>` that the HTML rules read
 * as raw text is skipped up to its closing tag: a `<` there starts nothing.
 *
 * @param ns the rules where the template as a whole is placed.
 */
export function holeNamespace(
  templates: ArrayLike<string>,
  ns: Namespace,
  hole: number,
): Namespace {
  let byNs = CACHE.get(templates as object);
  if (byNs === undefined) {
    // A template that holds no `<svg` or `<math` cannot leave HTML: every hole is
    // read in `ns`. Most are like that, and some are built on each call, where a
    // cache entry is never read again and costs more than the scan. So the entry
    // is made on the second sighting of the same array.
    if (ns === NS_HTML && !mayLeaveHtml(templates)) {
      if (templates !== lastClean) lastClean = templates as object;
      else CACHE.set(templates as object, [NO_FOREIGN, undefined, undefined]);
      return ns;
    }
    CACHE.set(templates as object, (byNs = [undefined, undefined, undefined]));
  }
  let holes = byNs[ns];
  if (holes === undefined) byNs[ns] = holes = scan(templates, ns);
  return holes[hole] ?? ns;
}

let lastClean: object | undefined;

/** Does the text hold a `<svg` or `<math`, in any letter case? Allocates nothing. */
function mayLeaveHtml(templates: ArrayLike<string>): boolean {
  for (let i = 0; i < templates.length; i++) {
    const text = templates[i] ?? "";
    for (let at = text.indexOf("<"); at !== -1; at = text.indexOf("<", at + 1)) {
      const c = text.charCodeAt(at + 1) | 32;
      if (
        c === 115 &&
        (text.charCodeAt(at + 2) | 32) === 118 &&
        (text.charCodeAt(at + 3) | 32) === 103
      )
        return true;
      if (
        c === 109 &&
        (text.charCodeAt(at + 2) | 32) === 97 &&
        (text.charCodeAt(at + 3) | 32) === 116 &&
        (text.charCodeAt(at + 4) | 32) === 104
      )
        return true;
    }
  }
  return false;
}

const CACHE = new WeakMap<object, [Namespace[]?, Namespace[]?, Namespace[]?]>();
/** Nothing in the text can leave HTML: every hole is HTML. */
const NO_FOREIGN: Namespace[] = [];

const isSpace = (c: string): boolean =>
  c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";
const isLetter = (c: string): boolean => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

/** The value of the `encoding` attribute in the text of a start tag, if it has one. */
function encodingOf(attrs: string): string | undefined {
  const lower = attrs.toLowerCase();
  for (let at = lower.indexOf("encoding"); at !== -1; at = lower.indexOf("encoding", at + 8)) {
    const before = at === 0 ? " " : attrs[at - 1]!;
    if (!isSpace(before) && before !== '"' && before !== "'") continue;
    let i = at + 8;
    while (i < attrs.length && isSpace(attrs[i]!)) i++;
    if (attrs[i] !== "=") continue;
    i++;
    while (i < attrs.length && isSpace(attrs[i]!)) i++;
    const q = attrs[i];
    if (q === '"' || q === "'") {
      const end = attrs.indexOf(q, i + 1);
      return end === -1 ? undefined : attrs.slice(i + 1, end);
    }
    let end = i;
    while (end < attrs.length && !isSpace(attrs[end]!)) end++;
    return attrs.slice(i, end);
  }
  return undefined;
}

const TEXT = 0;
const TAG_NAME = 1;
const TAG = 2;
const END_TAG = 3;
const SKIP = 4;
const RAW = 5;

function scan(templates: ArrayLike<string>, ns0: Namespace): Namespace[] {
  const count = templates.length;
  if (ns0 === NS_HTML) {
    let any = false;
    for (let i = 0; i < count && !any; i++) {
      const lower = (templates[i] ?? "").toLowerCase();
      any = lower.includes("<svg") || lower.includes("<math");
    }
    if (!any) return NO_FOREIGN;
  }

  // `stack[top]` is the rules that read the children of the open element.
  const stack: Namespace[] = [ns0];
  const holes: Namespace[] = [];
  let mode: number = TEXT;
  let name = "";
  let attrs = "";
  let quote = "";
  let rawCloser = "";
  let prevSignificant = "";

  for (let s = 0; s < count; s++) {
    const text = templates[s] ?? "";
    let lower: string | undefined;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      switch (mode) {
        case TEXT:
          if (c === "<") {
            const next = text[i + 1] ?? "";
            if (next === "/") {
              mode = END_TAG;
              i++;
            } else if (next === "!" || next === "?") {
              mode = SKIP;
            } else if (isLetter(next)) {
              mode = TAG_NAME;
              name = "";
              attrs = "";
              quote = "";
              prevSignificant = "";
            }
          }
          break;
        case TAG_NAME:
          if (isSpace(c) || c === "/" || c === ">") {
            mode = TAG;
            i--;
          } else name += c;
          break;
        case TAG:
          if (quote !== "") {
            attrs += c;
            if (c === quote) quote = "";
          } else if (c === '"' || c === "'") {
            quote = c;
            attrs += c;
          } else if (c === ">") {
            const lowerName = name.toLowerCase();
            const top = stack[stack.length - 1]!;
            const selfClosing = prevSignificant === "/" && top !== NS_HTML;
            const encoding = lowerName === "annotation-xml" ? encodingOf(attrs) : undefined;
            const child = childNamespace(
              name,
              encoding === undefined ? undefined : { encoding },
              top,
            );
            mode = TEXT;
            if (!selfClosing && !isVoidElement(lowerName)) {
              stack.push(child);
              // Raw text: the HTML rules read a script or style body up to its closer.
              if (top === NS_HTML && (lowerName === "script" || lowerName === "style")) {
                mode = RAW;
                rawCloser = `</${lowerName}`;
              }
            }
          } else {
            attrs += c;
            if (!isSpace(c)) prevSignificant = c;
          }
          break;
        case END_TAG:
          if (c === ">") {
            if (stack.length > 1) stack.pop();
            mode = TEXT;
          }
          break;
        case SKIP:
          if (c === ">") mode = TEXT;
          break;
        default: {
          lower ??= text.toLowerCase();
          const at = lower.indexOf(rawCloser, i);
          if (at === -1) i = text.length;
          else {
            i = at - 1;
            mode = TEXT;
          }
        }
      }
    }
    if (s < count - 1) {
      holes.push(stack[stack.length - 1]!);
      if (mode === TAG) attrs += "\u0000";
    }
  }
  return holes;
}
