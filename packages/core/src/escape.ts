const RE_ESCAPE_CONTENT = /[&<>]/;
const RE_ESCAPE_ATTR = /[&<>"']/;

export const escapeContent = (str: string): string => {
  const m = RE_ESCAPE_CONTENT.exec(str);
  if (!m) return str;
  let out = "";
  let last = 0;
  for (let i = m.index; i < str.length; i++) {
    let rep: string;
    switch (str.charCodeAt(i)) {
      case 38: rep = "&amp;"; break;
      case 60: rep = "&lt;"; break;
      case 62: rep = "&gt;"; break;
      default: continue;
    }
    if (i !== last) out += str.slice(last, i);
    out += rep;
    last = i + 1;
  }
  return out + str.slice(last);
};

export const escapeAttr = (str: string): string => {
  const m = RE_ESCAPE_ATTR.exec(str);
  if (!m) return str;
  let out = "";
  let last = 0;
  for (let i = m.index; i < str.length; i++) {
    let rep: string;
    switch (str.charCodeAt(i)) {
      case 38: rep = "&amp;"; break;
      case 60: rep = "&lt;"; break;
      case 62: rep = "&gt;"; break;
      case 34: rep = "&quot;"; break;
      case 39: rep = "&#39;"; break;
      default: continue;
    }
    if (i !== last) out += str.slice(last, i);
    out += rep;
    last = i + 1;
  }
  return out + str.slice(last);
};

// ── Rawtext escaping ──────────────────────────────────────────────────────

export const RAWTEXT_TAGS = new Set([
  "script", "style", "xmp", "iframe", "noembed", "noframes",
]);

const RAWTEXT_REGEX_CACHE = new Map<string, RegExp>();
for (const tag of RAWTEXT_TAGS) {
  RAWTEXT_REGEX_CACHE.set(tag, new RegExp(`</${tag}`, "i"));
}

export const RCDATA_TAGS = new Set(["textarea", "title"]);

export function escapeRawText(str: string, tag: string): string {
  if (!RAWTEXT_TAGS.has(tag)) return escapeContent(str);

  const re = RAWTEXT_REGEX_CACHE.get(tag)!;
  const m = re.exec(str);
  if (!m) return str;

  const tagLen = tag.length;
  const tagLower = tag.toLowerCase();
  let out = "";
  let last = 0;

  for (let i = m.index; i < str.length; i++) {
    if (
      str.charCodeAt(i) === 60 &&
      i + 2 + tagLen <= str.length &&
      str.charCodeAt(i + 1) === 47
    ) {
      let isMatch = true;
      for (let j = 0; j < tagLen; j++) {
        if ((str.charCodeAt(i + 2 + j) | 32) !== tagLower.charCodeAt(j)) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        if (i !== last) out += str.slice(last, i);
        out += `<\\${str.slice(i + 1, i + 2 + tagLen)}`;
        i += 1 + tagLen;
        last = i + 1;
      }
    }
  }
  return out + str.slice(last);
}

// ── Attribute / Tag name validation ───────────────────────────────────────

const REGEX_OTHER_UNICODE_CHARS_TEST = /\p{C}/u;
const REGEX_OTHER_UNICODE_CHARS_REPLACE = /\p{C}/gu;
const REGEX_VALID_ATTR_NAME = /^[^\s"'<>/=\p{C}]+$/u;
// A tag name is unsafe only if it can break OUT of `<...>`: whitespace, the
// delimiter chars " ' < > / = ` \, a leading ! or ? (comment / processing
// instruction), or a Unicode control. Everything else — including `svg:rect`,
// `foo_bar`, and custom elements — is safe to interpolate verbatim. This is a
// blocklist, like Preact and Hono, not a whitelist: the JSX parser already
// guarantees authored tags are clean, so this only guards manual
// `jsx(dynamicString, ...)` calls, and must not reject otherwise-valid names.
const REGEX_INVALID_TAG_NAME = /^[!?]|[\s"'<>/=`\\]|\p{C}/u;

export const sanitize = (str: string): string => {
  if (!REGEX_OTHER_UNICODE_CHARS_TEST.test(str)) return str;
  // @ts-ignore — TS doesn't know about \p{C} with u flag
  return str.replace(REGEX_OTHER_UNICODE_CHARS_REPLACE, "");
};

export const isValidAttrName = (name: string): boolean => {
  // ASCII fast-path: the `/u` + `\p{C}` regex has to decode code points, but
  // virtually every attribute name is plain ASCII. Reject the forbidden set
  // (controls, space, " ' < > / = , DEL) inline and only fall back to the
  // Unicode regex when a non-ASCII byte actually appears.
  const len = name.length;
  if (len === 0) return false;
  for (let i = 0; i < len; i++) {
    const c = name.charCodeAt(i);
    if (c > 127) return REGEX_VALID_ATTR_NAME.test(name);
    if (
      c <= 32 || // C0 controls + space (covers \s for ASCII)
      c === 34 || // "
      c === 39 || // '
      c === 47 || // /
      c === 60 || // <
      c === 61 || // =
      c === 62 || // >
      c === 127 // DEL
    )
      return false;
  }
  return true;
};

export const isValidTagName = (name: string): boolean => {
  return name.length > 0 && !REGEX_INVALID_TAG_NAME.test(name);
};

// ── URL scheme validation ─────────────────────────────────────────────────

const REGEX_UNSAFE_PROTOCOLS = /^(?:java|vb)script:/i;
const REGEX_IMAGE_DATA_URI =
  /^data:image\/(?:png|jpeg|gif|webp|avif)(?:[;+]|$)/i;

export const URL_ATTRIBUTES = new Set([
  "href", "src", "action", "formaction", "cite", "poster", "icon", "data",
  "xlink:href", "srcset",
]);

export const isSafeScheme = (url: string): boolean => {
  const c0 = url.charCodeAt(0);
  if (c0 === 47) return true; // "/" — relative path
  if (c0 === 35) return true; // "#" — fragment
  if (c0 === 63) return true; // "?" — query-only
  if (c0 === 109) {
    // "m" — starts with "mailto:"
    if (
      url.charCodeAt(1) === 97 &&  // "a"
      url.charCodeAt(2) === 105 && // "i"
      url.charCodeAt(3) === 108 && // "l"
      url.charCodeAt(4) === 116 && // "t"
      url.charCodeAt(5) === 111 && // "o"
      url.charCodeAt(6) === 58     // ":"
    ) return true;
  }
  if ((c0 | 32) === 104) {
    // "h" or "H" — starts with "http" (case-insensitive)
    if (
      (url.charCodeAt(1) | 32) === 116 && // "t" or "T"
      (url.charCodeAt(2) | 32) === 116 && // "t" or "T"
      (url.charCodeAt(3) | 32) === 112    // "p" or "P"
    ) return true;
  }
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
    (sanitized.charCodeAt(0) | 32) === 100 && // "d" or "D" — starts with "data:"
    (sanitized.charCodeAt(1) | 32) === 97 &&  // "a" or "A"
    (sanitized.charCodeAt(2) | 32) === 116 && // "t" or "T"
    (sanitized.charCodeAt(3) | 32) === 97 &&  // "a" or "A"
    sanitized.charCodeAt(4) === 58 &&         // ":"
    !REGEX_IMAGE_DATA_URI.test(sanitized)
  ) return false;
  return true;
};

const REGEX_SRCSET_CANDIDATE = /^(\S+)(?:\s+(?:\d+w|\d+(?:\.\d+)?x))?\s*$/;

export const isSafeSrcset = (srcset: string): boolean => {
  const sanitized = sanitize(srcset).trim();
  if (!sanitized) return true;
  for (const raw of sanitized.split(",")) {
    const candidate = raw.trim();
    if (!candidate) return false;
    const m = REGEX_SRCSET_CANDIDATE.exec(candidate);
    if (!m) return false;
    if (!isSafeScheme(m[1]!)) return false;
  }
  return true;
};

/** HTML void (self-closing) elements that must not have a closing tag. */
export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

/** Map of React/camelCase DOM attribute names to their HTML equivalents. */
export const ATTRIBUTE_NAME_MAP: Map<string, string> = new Map([
  ["htmlFor", "for"],
  ["className", "class"],
  ["acceptCharset", "accept-charset"],
  ["httpEquiv", "http-equiv"],
  ["xlinkHref", "xlink:href"],
  ["xmlnsXlink", "xmlns:xlink"],
  ["xmlLang", "xml:lang"],
  ["xmlBase", "xml:base"],
  ["xmlSpace", "xml:space"],
  ["tabIndex", "tabindex"],
  ["readOnly", "readonly"],
  ["maxLength", "maxlength"],
  ["minLength", "minlength"],
  ["autoFocus", "autofocus"],
  ["autoPlay", "autoplay"],
  ["autoComplete", "autocomplete"],
  ["encType", "enctype"],
  ["noValidate", "novalidate"],
  ["dateTime", "datetime"],
  ["srcSet", "srcset"],
]);
