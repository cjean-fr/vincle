// ── HTML text escaping ──────────────────────────────────────────────────

const RE_ESCAPE_HTML = /[&<>]/;

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
 * per element — on the `stack` benchmark a single per-element `Set.has` is worth
 * ~15%, which is what pays for tag-name validation on the same path.
 * `RAWTEXT_PATTERN` remains the source of truth for everything else.
 */
export function isRawtextTag(tag: string): boolean {
  return tag === "script" || tag === "style";
}

// Two regexes per rawtext tag: a non-global matcher for the common
// "nothing to neutralize" fast path (one scan, no allocation), and a global
// one used only to iterate matches once at least one hit is present.
// Iterating with a global regex avoids allocating a lowercased copy of the
// whole body just to do a case-insensitive indexOf.
//
// `<style>` is RAWTEXT: `</style` is the only sequence that can end it.
//
// `<script>` is SCRIPT_DATA, which has four more tokenizer states. `<!--` opens
// *script data escaped*, and a following `<script` opens *script data double
// escaped* — a state in which `</script>` no longer closes the element. So
// neutralizing `</script` alone was not enough: injecting `<!--<script>` made
// the renderer's own closing tag inert, and the rest of the document was consumed
// as script data. Measured against a spec-compliant parser, with `<p>after</p>`
// following the script element:
//
//   "<!--"          → [div, script, p]   harmless on its own
//   "<script"       → [div, script, p]   harmless on its own
//   "</script>"     → [div, script, p]   already neutralized
//   "<!--<script>"  → [div, script]      <p> swallowed
//
// Only the *pair* is dangerous, so breaking either member is enough, and
// `<script` is the cheaper one to break. Raw `<script` in script source is a
// syntax error, so it only ever occurs inside a string or a comment — where the
// `<\` form the HTML spec prescribes reads back as the original text (`"\s"` is
// `"s"`). `<!--` is left alone: it is valid JavaScript on its own line under
// Annex B, and escaping it there would be a syntax error.
//
// @see https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
const RAWTEXT_PATTERN = {
  script: "</?script",
  style: "</style",
} as const;

/**
 * The rawtext tags, derived from the patterns instead of listed again.
 *
 * The two used to be separate lists, and the loop below reconciled them with a
 * `?? "</" + tag` fallback for a tag that had no pattern — a branch nothing could
 * reach, since both members of the set had one. Mutation testing is what found it:
 * the fallback could be mutated to anything at all and no test noticed. Deriving
 * the set makes the mismatch it guarded against impossible instead of handled.
 */
export const RAWTEXT_TAGS: ReadonlySet<string> = new Set(Object.keys(RAWTEXT_PATTERN));

const RAWTEXT_DETECT = new Map<string, RegExp>();
const RAWTEXT_SCAN = new Map<string, RegExp>();
for (const [tag, pattern] of Object.entries(RAWTEXT_PATTERN)) {
  RAWTEXT_DETECT.set(tag, new RegExp(pattern, "i"));
  RAWTEXT_SCAN.set(tag, new RegExp(pattern, "gi"));
}

// ── Attribute value escaping ─────────────────────────────────────────────
//
// Escapes characters necessary to safely embed a value in a double-quoted
// HTML attribute (`name="value"`):
//   & → &amp;  (prevents entity injection)
//   " → &quot; (prevents attribute breakout)
//   < → &lt;   (defense-in-depth: XML compat, email clients)
//
// Per HTML5 spec, only & and " are strictly required inside double-quoted
// attribute values. < is technically valid but kept for safety in email/XHTML
// contexts where the parser might not follow the HTML5 spec.

const RE_ESCAPE_ATTR = /[&<"]/;

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

export function escapeRawTagContent(str: string, tag: string): string {
  const detectRe = RAWTEXT_DETECT.get(tag);
  if (detectRe === undefined) return escapeContent(str);

  const first = detectRe.exec(str); // non-global: no lastIndex bookkeeping, cheap no-match scan
  if (first === null) return str;

  const scanRe = RAWTEXT_SCAN.get(tag)!;
  let out = "",
    last = 0;
  scanRe.lastIndex = first.index;
  let m: RegExpExecArray | null;
  while ((m = scanRe.exec(str)) !== null) {
    // Match length is no longer fixed (`<!--`, `<script`, `</script`), so it is
    // read from the match rather than derived from the tag name.
    const idx = m.index;
    const end = idx + m[0].length;
    out += str.slice(last, idx) + "<\\" + str.slice(idx + 1, end);
    last = end;
    scanRe.lastIndex = last;
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
 * The first two used to reach the document verbatim; the last two used to be
 * rewritten to `#blocked` although no browser sees a scheme in them at all — a
 * scan for the first `:` alone cannot tell those four cases apart.
 *
 * A scheme is `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) ":"`. The scan stops
 * at the first character that cannot belong to one, so a long path or query is
 * never copied.
 *
 * @see https://url.spec.whatwg.org/#url-scheme-string
 */
function schemeOf(url: string): string | undefined {
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
