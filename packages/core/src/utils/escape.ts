// https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

/**
 * Attributes that expect a URL and should be sanitized.
 */
export const URL_ATTRIBUTES: Set<string> = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "cite",
  "poster",
  "icon",
  "data",
  "xlink:href",
  "srcset",
]);

/**
 * RAWTEXT elements: the HTML parser treats content as literal text.
 * Only `</tagName>` closes the element — entities are NOT decoded.
 * https://html.spec.whatwg.org/multipage/syntax.html#raw-text-elements
 */
export const RAWTEXT_TAGS = new Set([
  "script",
  "style",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
]);

const REGEX_RAWTEXT_CLOSE = new Map<string, RegExp>();
for (const tag of RAWTEXT_TAGS) {
  REGEX_RAWTEXT_CLOSE.set(tag, new RegExp(`</${tag}`, "gi"));
}

/**
 * RCDATA elements: the HTML parser decodes entities but still only
 * `</tagName>` closes the element at the byte level.
 * https://html.spec.whatwg.org/multipage/syntax.html#rcdata-elements
 */
export const RCDATA_TAGS = new Set(["textarea", "title"]);

const REGEX_CONTENT_TEST = /[&<>]/;
const REGEX_ATTR_TEST = /[&<>"']/;
const REGEX_OTHER_UNICODE_CHARS_TEST = /\p{C}/u;
const REGEX_OTHER_UNICODE_CHARS_REPLACE = /\p{C}/gu;
// Reject whitespace, quotes, angle brackets, `=`, `/`, AND any Unicode "Other"
// codepoint (controls, formatters, surrogates, etc.) in one pass. This lets
// `renderAttributeSync`'s hot path validate with a single regex test for
// clean ASCII names — only names that fail need the slower `sanitize` retry.
const REGEX_VALID_ATTR_NAME = /^[^\s"'<>/=\p{C}]+$/u;
const REGEX_VALID_TAG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const REGEX_UNSAFE_PROTOCOLS = /^(?:java|vb)script:/i;
const REGEX_IMAGE_DATA_URI =
  /^data:image\/(?:png|jpeg|gif|webp|avif)(?:[;+]|$)/i;

/**
 * Strips all 'Other' Unicode characters (controls, invisible formatters, etc.).
 */
export const sanitize = (str: string): string => {
  if (!REGEX_OTHER_UNICODE_CHARS_TEST.test(str)) {
    return str;
  }
  return str.replace(REGEX_OTHER_UNICODE_CHARS_REPLACE, "");
};

/**
 * Escape `&`, `<`, `>` for HTML text content.
 *
 * Two-stage strategy: an upfront `regex.test` (highly optimized native scan)
 * short-circuits for strings with no escapable char — the common case for
 * benign user text. Only when an escape is required do we walk the string
 * with `charCodeAt` + `slice`, which is still faster than `replaceAll` with
 * a callback (no per-match function dispatch).
 *
 * **Correct for:** normal HTML text content AND RCDATA elements (textarea, title).
 * In RCDATA mode the parser decodes entities but end-tag detection is byte-level,
 * so `&lt;/textarea&gt;` produces `</textarea>` as text without closing the element.
 */
export const escapeContent = (str: string): string => {
  if (!REGEX_CONTENT_TEST.test(str)) return str;
  let out = "";
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    let rep: string;
    switch (str.charCodeAt(i)) {
      case 38: // &
        rep = "&amp;";
        break;
      case 60: // <
        rep = "&lt;";
        break;
      case 62: // >
        rep = "&gt;";
        break;
      default:
        continue;
    }
    if (i !== last) out += str.slice(last, i);
    out += rep;
    last = i + 1;
  }
  return out + str.slice(last);
};

/**
 * Escape content for RAWTEXT elements (script, style, xmp, iframe, noembed, noframes).
 *
 * In rawtext mode the parser does NOT decode HTML entities, so `&lt;` would
 * appear as literal text. Instead we break `</tagName>` sequences by inserting
 * a backslash after the `<`:
 *
 *   `</script>` → `<\/script>`
 *
 * The backslash is transparent to both JavaScript (`\/` === `/` in strings)
 * and CSS (`\2f` decodes to `/`), so interpreted content is unchanged while
 * the HTML parser never sees a literal `</tagName>` byte sequence.
 *
 * Only `</tagName>` is escaped — standalone `<`, `<!--`, or `<tagName` outside
 * a closing context are preserved. This is safe because the HTML parser token
 * state machine only recognizes `</tagName>` (rawtext) or byte-level `</tagName>`
 * (RCDATA) as element-end signals.
 */
export function escapeRawText(str: string, tag: string): string {
  if (!RAWTEXT_TAGS.has(tag)) return escapeContent(str);
  return str.replace(REGEX_RAWTEXT_CLOSE.get(tag)!, (m) => `<\\${m.slice(1)}`);
}

/**
 * Escape `&`, `<`, `>`, `"`, `'` for HTML attribute values.
 * Safe for both double-quoted and single-quoted attributes.
 * Same two-stage strategy as {@link escapeContent}.
 */
export const escapeAttr = (str: string): string => {
  if (!REGEX_ATTR_TEST.test(str)) return str;
  let out = "";
  let last = 0;
  for (let i = 0; i < str.length; i++) {
    let rep: string;
    switch (str.charCodeAt(i)) {
      case 38: // &
        rep = "&amp;";
        break;
      case 60: // <
        rep = "&lt;";
        break;
      case 62: // >
        rep = "&gt;";
        break;
      case 34: // "
        rep = "&quot;";
        break;
      case 39: // '
        rep = "&#39;";
        break;
      default:
        continue;
    }
    if (i !== last) out += str.slice(last, i);
    out += rep;
    last = i + 1;
  }
  return out + str.slice(last);
};

/**
 * OWASP Rule #5: URL Sanitize
 * Blocks dangerous protocols like javascript:, vbscript:, and non-image data URIs.
 * Handles null bytes, Unicode homoglyph obfuscation and only allows specific
 * raster image types for data: URIs.
 *
 * Legitimate URL schemes are always pure ASCII. Any non-ASCII character in the
 * scheme portion is a homoglyph-based obfuscation attempt (e.g. cyrillic 'а'
 * in place of ASCII 'a' in "javascript:").
 */
export const isSafeScheme = (url: string): boolean => {
  // Fast path for common safe URL patterns — cheap charCodeAt checks avoid
  // sanitize(), trim(), and every regex for >99% of real-world URLs.
  const c0 = url.charCodeAt(0);
  if (c0 === 47) return true; // "/" — relative path
  if (c0 === 35) return true; // "#" — anchor
  if (c0 === 63) return true; // "?" — query-only
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
  if ((c0 | 32) === 104) {
    // "http" / "https" — case-insensitive
    if (
      (url.charCodeAt(1) | 32) === 116 &&
      (url.charCodeAt(2) | 32) === 116 &&
      (url.charCodeAt(3) | 32) === 112
    )
      return true;
  }

  // Slow path — unsafe schemes, data: URIs, homoglyph attacks.
  const sanitized = sanitize(url).trim();
  if (!sanitized) return true;

  const colon = sanitized.indexOf(":");
  if (colon !== -1) {
    for (let i = 0; i < colon; i++) {
      if (sanitized.charCodeAt(i) > 127) return false;
    }
  }

  if (REGEX_UNSAFE_PROTOCOLS.test(sanitized)) return false;

  if (
    sanitized.length > 5 &&
    (sanitized.charCodeAt(0) | 32) === 100 &&
    (sanitized.charCodeAt(1) | 32) === 97 &&
    (sanitized.charCodeAt(2) | 32) === 116 &&
    (sanitized.charCodeAt(3) | 32) === 97 &&
    sanitized.charCodeAt(4) === 58 &&
    !REGEX_IMAGE_DATA_URI.test(sanitized)
  ) {
    return false;
  }

  return true;
};

const REGEX_SRCSET_CANDIDATE = /^(\S+)(?:\s+(?:\d+w|\d+(?:\.\d+)?x))?\s*$/;

/**
 * `srcset` is a comma-separated list of image candidates, not a single URL.
 * Each candidate must match `URL [descriptor]` where descriptor is
 * `1x`/`2x` (density) or `100w`/`100h` (width/height). Empty candidates
 * and malformed descriptors are rejected.
 */
export const isSafeSrcset = (srcset: string): boolean => {
  const sanitized = sanitize(srcset).trim();
  if (!sanitized) return true;

  for (const raw of sanitized.split(",")) {
    const candidate = raw.trim();
    if (!candidate) return false;

    const m = REGEX_SRCSET_CANDIDATE.exec(candidate);
    if (!m) return false;

    const url = m[1]!;
    if (!isSafeScheme(url)) return false;
  }

  return true;
};

export const isValidAttrName = (name: string): boolean => {
  return REGEX_VALID_ATTR_NAME.test(name);
};

export const isValidTagName = (name: string): boolean => {
  return REGEX_VALID_TAG_NAME.test(name);
};
