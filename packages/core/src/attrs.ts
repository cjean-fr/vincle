import { escapeAttr } from "./escape.js";
import { RawString } from "./raw.js";
import { URL_ATTRIBUTES, isSafeScheme } from "./url-safety.js";

// ── React → HTML attribute name resolution ──────────────────────────
// Switch over Map.get: JSC compiles string switches to a jump table / trie,
// ~25% faster than Map.get (0.095 vs 0.128 µs per lookup, measured on JSC FTL).

export function resolveAttrName(key: string): string {
  switch (key) {
    case "className":
      return "class";
    case "htmlFor":
      return "for";
    case "acceptCharset":
      return "accept-charset";
    case "httpEquiv":
      return "http-equiv";
    case "xlinkHref":
      return "xlink:href";
    case "xmlnsXlink":
      return "xmlns:xlink";
    case "xmlLang":
      return "xml:lang";
    case "xmlBase":
      return "xml:base";
    case "xmlSpace":
      return "xml:space";
    case "tabIndex":
      return "tabindex";
    case "readOnly":
      return "readonly";
    case "maxLength":
      return "maxlength";
    case "minLength":
      return "minlength";
    case "autoFocus":
      return "autofocus";
    case "autoPlay":
      return "autoplay";
    case "autoComplete":
      return "autocomplete";
    case "encType":
      return "enctype";
    case "noValidate":
      return "novalidate";
    case "dateTime":
      return "datetime";
    case "srcSet":
      return "srcset";
    default:
      return key.toLowerCase();
  }
}

// ── HTML boolean attributes ─────────────────────────────────────────
export const BOOLEAN_ATTRIBUTES = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "declare",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
  "truespeed",
]);

// Gate for React→HTML name resolution: only names with an uppercase letter can
// be a React alias (className, htmlFor, …) or need lowercasing.
const RE_HAS_UPPER = /[A-Z]/;

// Reject attribute names that can break out of a tag: whitespace, "'<>/=\`, control chars.
// A valid name consists entirely of characters NOT in the forbidden set.
const RE_INVALID_ATTR_NAME = /[\s"'<>/=\p{C}]/u;

export function isValidAttrName(name: string): boolean {
  return !RE_INVALID_ATTR_NAME.test(name);
}

// Style camelCase → kebab regex (module-level, compiled once)
const RE_STYLE_CAMEL = /[A-Z]/g;

// ── Build attributes string ────────────────────────────────────────
//
// Tout est inline dans le for-loop pour éviter 2 appels de fonction
// par attribut sur le hotpath (bench: +10% avec les fonctions extraites).
// Les phases sont documentées par des commentaires inline :
//   1. normalize — skip réservés, résout React→HTML
//   2. validate  — rejette les noms dangereux
//   3. serialize — dispatche par type de valeur
//
// Le dispatch est ordonné par fréquence réelle : les strings dominent
// (class, id, href, data-*, aria-*), donc prennent la première branche
// sans coercion. `String(value)` n'est payé que pour les rares cas non-string.

export function buildAttrs(attrs: Record<string, unknown>): string {
  let out = "";

  for (const key in attrs) {
    // ── Phase 1 : Normaliser (skip réservés, résout React→HTML) ──
    if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML")
      continue;
    let attrName = key;
    if (RE_HAS_UPPER.test(key)) {
      attrName = resolveAttrName(key);
      if (attrName in attrs) continue;
    }

    const value = attrs[key];
    if (value === null || value === undefined) continue;
    if (RE_INVALID_ATTR_NAME.test(attrName)) continue;

    // ── Phase 2 : Sérialiser par type (string = hot path) ──
    const type = typeof value;

    // String — dominant case, coercion-free
    if (type === "string") {
      let str = value as string;
      if (URL_ATTRIBUTES.has(attrName) && !isSafeScheme(str)) str = "#blocked";
      out += ` ${attrName}="${escapeAttr(str)}"`;
      continue;
    }

    // Boolean — HTML booléen → nom seul, sinon stringifié
    if (type === "boolean") {
      if (BOOLEAN_ATTRIBUTES.has(attrName)) {
        if (value) out += ` ${attrName}`;
      } else {
        out += ` ${attrName}="${value}"`;
      }
      continue;
    }

    // number / bigint — safe, pas de check URL
    if (type === "number" || type === "bigint") {
      out += ` ${attrName}="${value}"`;
      continue;
    }

    // Function — ne peut pas être sérialisé
    if (type === "function") {
      throw new Error(
        `[vincle/core] Attribute "${key}" received a function as value. ` +
          "Functions are not serializable to HTML. Did you forget to call a component or pass a string?",
      );
    }

    // Style object → chaîne CSS
    if (attrName === "style" && type === "object" && !Array.isArray(value)) {
      const styleStr = styleToString(value as Record<string, string | number | null | undefined>);
      if (styleStr) out += ` style="${escapeAttr(styleStr)}"`;
      continue;
    }

    // Array class → string join
    if (attrName === "class" && Array.isArray(value)) {
      const s = classToString(value as unknown[]);
      if (!s) continue;
      out += ` class="${escapeAttr(s)}"`;
      continue;
    }

    // RawString — bypass explicite du développeur
    if (value instanceof RawString) {
      out += ` ${attrName}="${value.value}"`;
      continue;
    }

    // Fallback — tout objet avec toString
    let str = String(value);
    if (URL_ATTRIBUTES.has(attrName) && !isSafeScheme(str)) str = "#blocked";
    out += ` ${attrName}="${escapeAttr(str)}"`;
  }

  return out;
}

// ── Array class → string ─────────────────────────────────────────────
export function classToString(value: unknown[]): string {
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
export function styleToString(obj: Record<string, string | number | null | undefined>): string {
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
