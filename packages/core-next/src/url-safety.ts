const REGEX_UNSAFE_PROTOCOLS = /^(?:java|vb)script:/i;
const REGEX_IMAGE_DATA_URI = /^data:image\/(?:png|jpeg|gif|webp|avif)(?:[;+]|$)/i;

export const URL_ATTRIBUTES = new Set([
  "href", "src", "action", "formaction", "xlink:href",
]);

export function isSafeScheme(url: string): boolean {
  const c0 = url.charCodeAt(0);
  if (c0 === 47) return true;
  if (c0 === 35) return true;
  if (c0 === 63) return true;
  if (c0 === 109) {
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
    if (
      (url.charCodeAt(1) | 32) === 116 &&
      (url.charCodeAt(2) | 32) === 116 &&
      (url.charCodeAt(3) | 32) === 112
    )
      return true;
  }
  const trimmed = url.trim();
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
    (trimmed.charCodeAt(0) | 32) === 100 &&
    (trimmed.charCodeAt(1) | 32) === 97 &&
    (trimmed.charCodeAt(2) | 32) === 116 &&
    (trimmed.charCodeAt(3) | 32) === 97 &&
    trimmed.charCodeAt(4) === 58 &&
    !REGEX_IMAGE_DATA_URI.test(trimmed)
  )
    return false;
  return true;
}


