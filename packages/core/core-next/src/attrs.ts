// Gate for React→HTML name resolution: only names with an uppercase letter can
// be a React alias (className, htmlFor, …) or need lowercasing.
const RE_HAS_UPPER = /[A-Z]/;

// ── React → HTML attribute name resolution ──────────────────────────
//
// Switch over Map.get: JSC compiles string switches to a jump table / trie,
// ~25% faster than Map.get (0.095 vs 0.128 µs per lookup, measured on JSC FTL).
// Keep the Map export for downstream consumers (precompile-core etc.) but the
// hot path in buildAttrs and jsxAttr uses the switch directly.

/**
 * Resolve a React camelCase attr name to its HTML equivalent.
 *
 * Non‑React names (or unknown camelCase names) are lowercased in the default
 * branch, so callers never need a fallback — the returned string is always the
 * HTML attribute name to emit.
 */
export function resolveAttrName(key: string): string {
  switch (key) {
    case "className":     return "class";
    case "htmlFor":       return "for";
    case "acceptCharset": return "accept-charset";
    case "httpEquiv":     return "http-equiv";
    case "xlinkHref":     return "xlink:href";
    case "xmlnsXlink":    return "xmlns:xlink";
    case "xmlLang":       return "xml:lang";
    case "xmlBase":       return "xml:base";
    case "xmlSpace":      return "xml:space";
    case "tabIndex":      return "tabindex";
    case "readOnly":      return "readonly";
    case "maxLength":     return "maxlength";
    case "minLength":     return "minlength";
    case "autoFocus":     return "autofocus";
    case "autoPlay":      return "autoplay";
    case "autoComplete":  return "autocomplete";
    case "encType":       return "enctype";
    case "noValidate":    return "novalidate";
    case "dateTime":      return "datetime";
    case "srcSet":        return "srcset";
    default:              return key.toLowerCase();
  }
}

// ── React → HTML attribute name map (backward compat) ───────────────
// Kept as a Map export for downstream consumers (precompile-core, tooling).
// Hot paths should use resolveAttrName() directly.
export const ATTRIBUTE_NAME_MAP: ReadonlyMap<string, string> = new Map([
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

// ── HTML boolean attributes ─────────────────────────────────────────
export const BOOLEAN_ATTRIBUTES = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay",
  "checked", "controls", "declare", "default", "defer",
  "disabled", "formnovalidate", "hidden", "inert", "ismap",
  "itemscope", "loop", "multiple", "muted", "nomodule",
  "novalidate", "open", "playsinline", "readonly", "required",
  "reversed", "selected", "truespeed",
]);

// ── Event handler detection ─────────────────────────────────────────
// Matches `on` + a lowercase letter at position 2 (onclick, onblur, …) via two
// charCodeAt reads — no allocation, no regex. Used to decide how a handler
// value is serialized (function → drop, string → emit) identically in the
// runtime (buildAttrs) and precompile (jsxAttr) paths.
const ON_MASK = ("o".charCodeAt(0) << 8) | "n".charCodeAt(0);

export function isEventHandler(name: string): boolean {
  const c2 = name.charCodeAt(2) | 32;
  return (
    (((name.charCodeAt(0) | 32) << 8) | (name.charCodeAt(1) | 32)) === ON_MASK &&
    c2 >= 97 && c2 <= 122
  );
}

/**
 * Throw for a non-serializable function attribute value. Isolated so the
 * (cold) error-construction cost never sits inline in the hot attribute loop.
 */
function throwFunctionAttr(name: string): never {
  throw new Error(
    `[vincle/core] Attribute "${name}" received a function as value. ` +
      "Functions are not serializable to HTML. Did you forget to call a component, " +
      "or mean to write a string event handler (e.g. onclick=\"…\")?",
  );
}

// ── Build attributes string (single pass: normalize + emit) ────────
export function buildAttrs(attrs: Record<string, unknown>): string {
  let out = "";

  for (const key in attrs) {
    if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML") continue;
    let value = attrs[key];
    if (value === null || value === undefined) continue;

    // Resolve React name → HTML name (className→class, htmlFor→for, …).
    // resolveAttrName lowercases unknown camelCase names on its own, so the
    // returned string is always the HTML name to emit.
    let attrName = key;
    if (RE_HAS_UPPER.test(key)) {
      attrName = resolveAttrName(key);
      // When both React name and HTML name appear, HTML wins — skip React alias
      if (attrName in attrs) continue;
    }

    // Event handlers: a function is client-side intent, not serializable to
    // static HTML — drop it. A string is a deliberate inline handler — emit it.
    if (isEventHandler(attrName)) {
      if (typeof value !== "string") continue;
      out += ` ${attrName}="${escapeAttr(value)}"`;
      continue;
    }

    // Any other function value is a programmer error (a component or callback
    // where a serializable value is expected).
    if (typeof value === "function") throwFunctionAttr(attrName);

    // Style object → string
    if (attrName === "style" && typeof value === "object" && !Array.isArray(value)) {
      value = styleToString(value as Record<string, string | number | null | undefined>);
    }

    // Array class → string (for loop, no filter/join)
    if (attrName === "class" && Array.isArray(value)) {
      let s = "";
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (item && typeof item === "string") {
          if (s) s += " ";
          s += item;
        }
      }
      if (!s) continue;
      value = s;
    }

    // Boolean attribute
    if (typeof value === "boolean") {
      if (BOOLEAN_ATTRIBUTES.has(attrName)) {
        if (value) out += ` ${attrName}`;
      } else {
        // Non-boolean HTML attr with boolean value → render as string
        out += ` ${attrName}="${value}"`;
      }
      continue;
    }

    out += ` ${attrName}="${escapeAttr(String(value))}"`;
  }

  return out;
}

// ── Style object → CSS string ───────────────────────────────────────
export function styleToString(obj: Record<string, string | number | null | undefined>): string {
  let out = "";
  for (const key in obj) {
    const value = obj[key];
    if (value === null || value === undefined) continue;
    const prop = key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    if (out) out += ";";
    out += `${prop}:${value}`;
  }
  return out;
}

// ── Attribute value escaping ────────────────────────────────────────
// Escapes only what can break out of a double-quoted attribute: `&`, `"`, `<`.
// This is the sole XSS guard on attribute values — vincle does NOT rewrite URL
// schemes (javascript:, data:, …). Escaping prevents attribute/tag breakout;
// scheme policy is the app's responsibility (CSP + sanitizing untrusted URLs).
export function escapeAttr(str: string): string {
  let out = "", start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; } // &
    else if (c === 34) { out += str.slice(start, i) + "&quot;"; start = i + 1; } // "
    else if (c === 60) { out += str.slice(start, i) + "&lt;";   start = i + 1; } // <
  }
  return start === 0 ? str : out + str.slice(start);
}
