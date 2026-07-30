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

export const RAWTEXT_TAGS = new Set(["script", "style"]);

/**
 * Does this tag hold rawtext (`<script>` / `<style>`)?
 *
 * Two literal comparisons rather than `RAWTEXT_TAGS.has(tag)`. The set has two
 * members, tag names arrive interned from the JSX transform, and this runs once
 * per element — on the `stack` benchmark a single per-element `Set.has` is worth
 * ~15%, which is what pays for tag-name validation on the same path.
 * `RAWTEXT_TAGS` remains the source of truth for everything else.
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
const RAWTEXT_PATTERN: Record<string, string> = {
  script: "</?script",
  style: "</style",
};

const RAWTEXT_DETECT = new Map<string, RegExp>();
const RAWTEXT_SCAN = new Map<string, RegExp>();
for (const tag of RAWTEXT_TAGS) {
  const pattern = RAWTEXT_PATTERN[tag] ?? "</" + tag;
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

const REGEX_UNSAFE_PROTOCOLS = /^(?:java|vb)script:/i;
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

/**
 * Strip what a URL parser strips before it looks at the scheme.
 *
 * Per WHATWG URL, parsing *removes all ASCII tab and newline* from the input and
 * *removes leading and trailing C0 controls and space*. Testing the raw string
 * against `^(?:java|vb)script:` therefore tests a string no browser ever parses:
 *
 *   "java\tscript:alert(1)"  →  new URL(…).protocol === "javascript:"
 *   "\0javascript:alert(1)"  →  new URL(…).protocol === "javascript:"
 *
 * Both bypassed the check and reached the document verbatim. `String.trim()` is
 * not enough on either count: it does not touch interior characters, and `\0` is
 * not whitespace.
 *
 * Only the scheme matters here, so the scan stops at the first `:` — a long
 * query string is never copied. Returns the input unchanged (no allocation) when
 * there is nothing to strip, which is every real URL.
 *
 * @see https://url.spec.whatwg.org/#concept-basic-url-parser
 */
function normalizeForSchemeCheck(url: string): string {
  const len = url.length;
  let i = 0;
  // Leading C0 controls and space are dropped outright.
  while (i < len && url.charCodeAt(i) <= 0x20) i++;

  let out = "";
  let start = i;
  for (; i < len; i++) {
    const c = url.charCodeAt(i);
    // A ':' ends the scheme: past it, nothing can change which scheme this is.
    if (c === 58) {
      i++;
      break;
    }
    // Tab (0x09), LF (0x0A), CR (0x0D) are removed anywhere in the input.
    if (c === 0x09 || c === 0x0a || c === 0x0d) {
      out += url.slice(start, i);
      start = i + 1;
    }
  }
  return start === 0 ? url : out + url.slice(start);
}

export function isSafeScheme(url: string): boolean {
  const c0 = url.charCodeAt(0);
  if (c0 === 47) return true;  // '/'
  if (c0 === 35) return true;  // '#'
  if (c0 === 63) return true;  // '?'
  if (c0 === 109) {
    // "mailto:"
    if (
      url.charCodeAt(1) === 97 &&
      url.charCodeAt(2) === 105 &&
      url.charCodeAt(3) === 108 &&
      url.charCodeAt(4) === 116 &&
      url.charCodeAt(5) === 111 &&
      url.charCodeAt(6) === 58
    )
      return true;
  }
  // "http" (case-insensitive). Safe as a fast path even though it also admits
  // "httpx:" — an unknown scheme does not execute; only the script schemes and
  // non-image data: URIs below do.
  if ((c0 | 32) === 104) {
    if (
      (url.charCodeAt(1) | 32) === 116 &&
      (url.charCodeAt(2) | 32) === 116 &&
      (url.charCodeAt(3) | 32) === 112
    )
      return true;
  }
  const trimmed = normalizeForSchemeCheck(url).trim();
  if (!trimmed) return true;
  const colon = trimmed.indexOf(":");
  if (colon !== -1) {
    for (let i = 0; i < colon; i++) {
      if (trimmed.charCodeAt(i) > 127) return false;
    }
  }
  if (REGEX_UNSAFE_PROTOCOLS.test(trimmed)) return false;
  if (
    trimmed.length > 5 &&
    (trimmed.charCodeAt(0) | 32) === 100 && // 'd' — "data:"
    (trimmed.charCodeAt(1) | 32) === 97 &&  // 'a'
    (trimmed.charCodeAt(2) | 32) === 116 && // 't'
    (trimmed.charCodeAt(3) | 32) === 97 &&  // 'a'
    trimmed.charCodeAt(4) === 58 &&          // ':'
    !REGEX_IMAGE_DATA_URI.test(trimmed)
  )
    return false;
  return true;
}
