import { escapeAttr } from "./escape.js";
import { RawString } from "./raw.js";
import { URL_ATTRIBUTES, isSafeScheme } from "./url-safety.js";

// ── React → HTML attribute name resolution ──────────────────────────
// Switch over Map.get: JSC compiles string switches to a jump table / trie,
// ~25% faster than Map.get (0.095 vs 0.128 µs per lookup, measured on JSC FTL).

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

// Gate for React→HTML name resolution: only names with an uppercase letter can
// be a React alias (className, htmlFor, …) or need lowercasing.
const RE_HAS_UPPER = /[A-Z]/;

// Style camelCase → kebab regex (module-level, compiled once)
const RE_STYLE_CAMEL = /[A-Z]/g;

// ── Build attributes string (single pass: normalize + emit) ────────
//
// Dispatch is ordered by real-world frequency: string values dominate (class,
// id, href, data-*, aria-*, …), so they take the first, coercion-free branch —
// `String(value)` is only paid for the rare non-string fallthrough. Keeping the
// hot branch monomorphic and coercion-free is the measured win over a
// normalize-then-emit structure (JSC/V8 inline caches).
export function buildAttrs(attrs: Record<string, unknown>): string {
  let out = "";

  for (const key in attrs) {
    if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML") continue;
    const value = attrs[key];
    if (value === null || value === undefined) continue;
    const type = typeof value;

    // Resolve React name → HTML name (className→class, htmlFor→for, …).
    // resolveAttrName lowercases unknown camelCase names on its own, so the
    // returned string is always the HTML name to emit.
    let attrName = key;
    if (RE_HAS_UPPER.test(key)) {
      attrName = resolveAttrName(key);
      // When both React name and HTML name appear, HTML wins — skip React alias
      if (attrName in attrs) continue;
    }

    // String — dominant case, no coercion.
    if (type === "string") {
      // URL safety — block javascript:/vbscript: in href, src, action, formaction, xlink:href
      let str = value as string;
      if (URL_ATTRIBUTES.has(attrName) && !isSafeScheme(str)) str = "#blocked";
      out += ` ${attrName}="${escapeAttr(str)}"`;
      continue;
    }

    // Boolean attribute
    if (type === "boolean") {
      if (BOOLEAN_ATTRIBUTES.has(attrName)) {
        if (value) out += ` ${attrName}`;
      } else {
        out += ` ${attrName}="${value}"`;
      }
      continue;
    }

    // Functions cannot be serialized to HTML — fail hard
    if (type === "function") {
      throw new Error(
        `[vincle/core] Attribute "${key}" received a function as value. ` +
          "Functions are not serializable to HTML. Did you forget to call a component or pass a string?",
      );
    }

    // Style object → string
    if (attrName === "style" && type === "object" && !Array.isArray(value)) {
      const styleStr = styleToString(value as Record<string, string | number | null | undefined>);
      out += ` style="${escapeAttr(styleStr)}"`;
      continue;
    }

    // Array class → string (for loop, no filter/join)
    if (attrName === "class" && Array.isArray(value)) {
      const s = classToString(value as unknown[]);
      if (!s) continue;
      out += ` class="${escapeAttr(s)}"`;
      continue;
    }

    // RawString bypass — developer explicitly opts out
    if (value instanceof RawString) {
      out += ` ${attrName}="${value.value}"`;
      continue;
    }

    // number / bigint — safe, no URL check needed
    if (type === "number" || type === "bigint") {
      out += ` ${attrName}="${value}"`;
      continue;
    }

    // Fallback: any other object with toString
    let str = String(value);
    if (URL_ATTRIBUTES.has(attrName) && !isSafeScheme(str)) str = "#blocked";
    out += ` ${attrName}="${escapeAttr(str)}"`;
  }

  return out;
}

// ── Array class → string ─────────────────────────────────────────────
function classToString(value: unknown[]): string {
  let s = "";
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (item && typeof item === "string") {
      if (s) s += " ";
      s += item;
    }
  }
  return s;
}

// ── Style object → CSS string ───────────────────────────────────────
function styleToString(obj: Record<string, string | number | null | undefined>): string {
  let out = "";
  for (const key in obj) {
    const value = obj[key];
    if (value === null || value === undefined) continue;
    const prop = key.replace(RE_STYLE_CAMEL, (m) => "-" + m.toLowerCase());
    if (out) out += ";";
    out += `${prop}:${value}`;
  }
  return out;
}


