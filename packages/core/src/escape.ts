import { RawString, VNode } from "./types.js";

const RE_ESCAPE_HTML = /[&<>]/;

/**
 * Escape a string for HTML *text* content — `&`, `<`, `>`. Quotes are left
 * alone: they carry no meaning outside an attribute.
 *
 * `renderToString` applies this to every text child already; reach for it only
 * when you build markup by hand.
 *
 * @example
 * ```ts
 * escapeContent(`a & b < c`); // "a &amp; b &lt; c"
 * ```
 */
export function escapeContent(str: string): string {
  const first = str.search(RE_ESCAPE_HTML);
  if (first === -1) return str;

  let out = str.slice(0, first);
  let start = first;
  for (let i = first; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38) {
      out += str.slice(start, i) + "&amp;";
      start = i + 1;
    } // &
    else if (c === 60) {
      out += str.slice(start, i) + "&lt;";
      start = i + 1;
    } // <
    else if (c === 62) {
      out += str.slice(start, i) + "&gt;";
      start = i + 1;
    } // >
  }
  return out + str.slice(start);
}

// ── Rawtext tag content escaping (script/style) ─────────────────────────

/**
 * Does this tag hold rawtext (`<script>` / `<style>`)?
 *
 * Two literal comparisons rather than `RAWTEXT_TAGS.has(tag)`. The set has two
 * members, tag names arrive interned from the JSX transform, and this runs once
 * per element — a per-element `Set.has` is worth the same order of magnitude as
 * the tag-name validation on the same path, which is what pays for keeping both.
 * `RAWTEXT_LANG` remains the source of truth for everything else.
 */
export function isRawtextTag(tag: string): boolean {
  return tag === "script" || tag === "style";
}

// `<style>` (RAWTEXT) closes only on `</style`, escaped with `<\` — CSS reads a
// `\` before a non-hex character as that character, so `"<\/style>"` reads back
// `</style>`.
//
// `<script>` (SCRIPT_DATA) needs more: neutralizing `</script` alone isn't
// enough, because `<!--` followed by `<script` enters *script data double
// escaped*, a state where `</script>` no longer closes the element — so
// `<script` itself must break too. It's escaped with the unicode form `<`
// rather than `<\`, because a `<script>` block can hold JSON (`ld+json`,
// `importmap`) as well as JS, and `<` is the one escape both languages read
// back as `<` — `<\` is valid JS (`\s` → `s`) but a JSON parse error.
//
// Neither escape is universal: a literal `\` right before the `<` still reaches
// the sub-language unescaped. A third language with no such escape at all (e.g.
// Mustache in `<script type="text/template">`) can't go through this path —
// that content belongs behind `raw()`, caller-owned (see guide/security).
//
// @see https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
const RAWTEXT_LANG = {
  script: { pattern: "</?script", escape: "\\u003c" },
  style: { pattern: "</style", escape: "<\\" },
} as const;

/** The rawtext tags, derived from the language table so the two cannot drift apart. */
export const RAWTEXT_TAGS: ReadonlySet<string> = new Set(Object.keys(RAWTEXT_LANG));

// Per tag: a non-global matcher for the no-match fast path, and a global one to
// iterate matches once one is found — avoids a lowercased copy of the body just
// to do a case-insensitive scan.
interface RawtextRule {
  readonly detect: RegExp;
  readonly scan: RegExp;
  readonly escape: string;
}

const RAWTEXT_RULES = new Map<string, RawtextRule>();
for (const [tag, { pattern, escape }] of Object.entries(RAWTEXT_LANG)) {
  RAWTEXT_RULES.set(tag, {
    detect: new RegExp(pattern, "i"),
    scan: new RegExp(pattern, "gi"),
    escape,
  });
}

// HTML5 only requires escaping & and " inside a double-quoted attribute; < is
// escaped too as defense-in-depth for XML/email clients that don't follow spec.
const RE_ESCAPE_ATTR = /[&<"]/;

/**
 * Escape a string for a double-quoted attribute value — `&`, `<`, `"`.
 *
 * `>` is deliberately left alone: it cannot end a double-quoted value.
 *
 * @example
 * ```ts
 * `<a title="${escapeAttr(untrusted)}">`;
 * ```
 */
export function escapeAttr(str: string): string {
  const first = str.search(RE_ESCAPE_ATTR);
  if (first === -1) return str;

  let out = str.slice(0, first);
  let start = first;
  for (let i = first; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38) {
      out += str.slice(start, i) + "&amp;";
      start = i + 1;
    } // &
    else if (c === 34) {
      out += str.slice(start, i) + "&quot;";
      start = i + 1;
    } // "
    else if (c === 60) {
      out += str.slice(start, i) + "&lt;";
      start = i + 1;
    } // <
  }
  return out + str.slice(start);
}

/**
 * Escape content for a rawtext element (`<script>`, `<style>`), where HTML
 * entities are *not* decoded — only the closing sequence may be neutralised.
 *
 * The escape is the one the element's sub-language reads back as the original
 * text: a unicode escape under `<script>`, valid in both JS and JSON, and a
 * backslash under `<style>`, where the content is always CSS.
 *
 * @example
 * ```ts
 * escapeRawTagContent(`if (a < b) alert("</script>")`, "script");
 * ```
 */
export function escapeRawTagContent(str: string, tag: string): string {
  const rule = RAWTEXT_RULES.get(tag);
  if (rule === undefined) return escapeContent(str);

  const first = rule.detect.exec(str); // non-global: no lastIndex bookkeeping, cheap no-match scan
  if (first === null) return str;

  const { scan, escape } = rule;
  let out = "",
    last = 0;
  scan.lastIndex = first.index;
  let m: RegExpExecArray | null;
  while ((m = scan.exec(str)) !== null) {
    // Match length varies with the pattern (`<script` and `</script` differ by
    // one), so it is read from the match rather than derived from the tag name.
    // Only the leading `<` is replaced; the rest of the match is copied
    // verbatim, which is what preserves the original case.
    const idx = m.index;
    const end = idx + m[0].length;
    out += str.slice(last, idx) + escape + str.slice(idx + 1, end);
    last = end;
    scan.lastIndex = last;
  }
  return out + str.slice(last);
}

// ── URL scheme validation ────────────────────────────────────────────────

const REGEX_IMAGE_DATA_URI = /^data:image\/(?:png|jpeg|gif|webp|avif)(?:[;+]|$)/i;

export const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  // `<object data>` / `<embed src>` navigate the same way `<iframe src>` does;
  // `data` is the only one of the two not already covered by `src`.
  "data",
]);

// Tab / LF / CR, removed from anywhere in a URL before it is parsed.
const RE_URL_TAB_NEWLINE = /[\t\n\r]/g;

/**
 * The scheme a WHATWG URL parser would read, or `undefined` when the input
 * carries none — in which case it is a relative reference and there is no
 * scheme to judge.
 *
 * Deriving the scheme instead of pattern-matching the raw string is what makes
 * the answer match the browser's:
 *
 *   "java\tscript:alert(1)"  →  "javascript"   tab removed mid-scheme
 *   "\0javascript:alert(1)"  →  "javascript"   leading C0 control removed
 *   "recherche?q=café:x"     →  undefined      '?' ends any scheme candidate
 *   "jаvascript:alert(1)"    →  undefined      'а' is Cyrillic, not a scheme char
 *
 * A scan for the first `:` alone cannot tell those four apart: it misses the
 * scheme in the first two and invents one in the last two, where no browser
 * sees a scheme at all.
 *
 * A scheme is `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"`. The scan stops
 * at the first character that cannot belong to one, so a long path or query is
 * never copied.
 *
 * @see https://url.spec.whatwg.org/#url-scheme-string
 */
export function schemeOf(url: string): string | undefined {
  const len = url.length;
  let i = 0;
  // Leading C0 controls and space are dropped before parsing.
  while (i < len && url.charCodeAt(i) <= 0x20) i++;

  const start = i;
  let seen = false;
  let hasTabOrNewline = false;

  for (; i < len; i++) {
    const c = url.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d) {
      hasTabOrNewline = true;
      continue;
    }
    if (c === 58) {
      if (!seen) return undefined; // ":" with no scheme before it
      const scheme = url.slice(start, i);
      return (hasTabOrNewline ? scheme.replace(RE_URL_TAB_NEWLINE, "") : scheme).toLowerCase();
    }
    const alpha = (c | 32) >= 97 && (c | 32) <= 122;
    if (!seen) {
      if (!alpha) return undefined; // a scheme must start with an ASCII alpha
      seen = true;
      continue;
    }
    if (!alpha && !(c >= 48 && c <= 57) && c !== 43 && c !== 45 && c !== 46) return undefined;
  }
  return undefined; // no ":" at all
}

export function isSafeScheme(url: string): boolean {
  // Fast paths for the shapes that cannot carry a scheme, plus the dominant one
  // that can: they skip the scan and the lowercased copy it ends with.
  const c0 = url.charCodeAt(0);
  if (c0 === 47 || c0 === 35 || c0 === 63) return true; // '/', '#', '?'
  // "http" (case-insensitive). Safe even though it also admits "httpx:" — an
  // unknown scheme does not execute; only the schemes named below do.
  if (
    (c0 | 32) === 104 &&
    (url.charCodeAt(1) | 32) === 116 &&
    (url.charCodeAt(2) | 32) === 116 &&
    (url.charCodeAt(3) | 32) === 112
  )
    return true;

  const scheme = schemeOf(url);
  if (scheme === undefined) return true; // relative reference — nothing to judge
  if (scheme === "javascript" || scheme === "vbscript") return false;
  // Only image payloads: `data:text/html` is a document, and a document that the
  // page links to runs script. The parser's own normalization is applied first,
  // so `data:image/png\t;base64,…` is judged as the browser will read it.
  if (scheme === "data")
    return REGEX_IMAGE_DATA_URI.test(url.replace(RE_URL_TAB_NEWLINE, "").trim());
  return true;
}

// ── Value → text coercion ────────────────────────────────────────────────

/**
 * The leaf taxonomy: a value that is not a node, rendered as text.
 *
 * One definition, two escaping policies. `rawtextTag` names the sub-language
 * when the leaf sits inside `<script>` or `<style>`, where HTML-escaping would
 * corrupt it, and is `undefined` in ordinary content — a tag name rather than an
 * escape function, because `escapeRawTagContent` needs the tag and a function
 * parameter would mean a closure allocated per text node.
 *
 * Callers own every *non*-leaf shape, because each has its own answer for it: the
 * walk renders a VNode, the fold declines it, `valueToText` refuses it.
 */
export function renderLeaf(v: unknown, rawtextTag: string | undefined): string {
  if (v === null || v === undefined || typeof v === "boolean") return "";
  if (typeof v === "string")
    return rawtextTag === undefined ? escapeContent(v) : escapeRawTagContent(v, rawtextTag);
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof RawString) return v.value;
  // Inside rawtext the coercion is `String` under the tag's own escape: an entity
  // is never decoded there, so HTML-escaping would put `&lt;` in the JavaScript.
  return rawtextTag === undefined
    ? escapeContent(String(v))
    : escapeRawTagContent(String(v), rawtextTag);
}

export function valueToText(v: unknown): string {
  // A VNode is not a text value: stringifying one would emit `[object Object]`
  // silently. The message says what to do instead — naming only what the reader
  // can act on: `valueToText` and `renderNode` are internal, and sending someone
  // looking for a symbol they cannot import is worse than saying less.
  if (v instanceof VNode) {
    throw new Error(
      "[vincle/core] A VNode reached a text position: a component renders through the tree walk, " +
        "not as a text value. Check that it is used as JSX (<Comp />) rather than interpolated as " +
        "{comp}, and that the tree is rendered with renderToString().",
    );
  }
  return renderLeaf(v, undefined);
}

// ── Iterable protocol tests ──────────────────────────────────────────────
//
// Property tests, not `instanceof`, so any iterable (Set, generators,
// cross-realm) renders. The `typeof === "object"` guard matters: strings are
// iterable, and without it a text leaf would recurse through its own characters.

export function isIterable(v: unknown): v is Iterable<unknown> {
  return (
    v != null &&
    typeof v === "object" &&
    typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
  );
}

export function isAsyncIterable(v: unknown): v is AsyncIterable<unknown> {
  return (
    v != null &&
    typeof v === "object" &&
    typeof (v as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function"
  );
}
