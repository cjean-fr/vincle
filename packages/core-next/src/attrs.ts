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
// Kept as a Map export for downstream consumers (precompile-core, core stable).
// Hot paths should use resolveAttrName() directly.
const ATTRIBUTE_NAME_MAP: ReadonlyMap<string, string> = new Map([
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
const BOOLEAN_ATTRIBUTES = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay",
  "checked", "controls", "declare", "default", "defer",
  "disabled", "formnovalidate", "hidden", "inert", "ismap",
  "itemscope", "loop", "multiple", "muted", "nomodule",
  "novalidate", "open", "playsinline", "readonly", "required",
  "reversed", "selected", "truespeed",
]);

// ── Build attributes string (single pass: normalize + emit) ────────
export function buildAttrs(attrs: Record<string, unknown>): string {
  let out = "";

  for (const key in attrs) {
    if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML") continue;
    let value = attrs[key];
    if (value === null || value === undefined) continue;

    // Functions cannot be serialized to HTML — fail hard
    if (typeof value === "function") {
      throw new Error(
        `[vincle/core] Attribute "${key}" received a function as value. ` +
          "Functions are not serializable to HTML. Did you forget to call a component or pass a string?",
      );
    }

    // Resolve React name → HTML name (className→class, htmlFor→for, …).
    // resolveAttrName lowercases unknown camelCase names on its own, so the
    // returned string is always the HTML name to emit.
    let attrName = key;
    if (RE_HAS_UPPER.test(key)) {
      attrName = resolveAttrName(key);
      // When both React name and HTML name appear, HTML wins — skip React alias
      if (attrName in attrs) continue;
    }

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
function styleToString(obj: Record<string, string | number | null | undefined>): string {
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
function escapeAttr(str: string): string {
  let out = "", start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; } // &
    else if (c === 34) { out += str.slice(start, i) + "&quot;"; start = i + 1; } // "
    else if (c === 60) { out += str.slice(start, i) + "&lt;";   start = i + 1; } // <
  }
  return start === 0 ? str : out + str.slice(start);
}
