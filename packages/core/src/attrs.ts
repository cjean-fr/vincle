import { escapeAttr, URL_ATTRIBUTES, isSafeScheme } from "./escape.js";
import { RawString } from "./types.js";

// ── React → HTML attribute name resolution ──────────────────────────
// Switch over Map.get: JSC compiles string switches to a jump table / trie,
// ~25% faster than Map.get (0.095 vs 0.128 µs per lookup, measured on JSC FTL).
//
// The default lowercases — HTML attrs are case-insensitive, and URL attrs
// (href, src, etc.) must be normalized for safety checks.
// SVG/MathML attrs are case-sensitive; the ones that differ from their
// lowercased form are listed explicitly so they survive unchanged.

export function resolveAttrName(key: string): string {
  switch (key) {
    // ── React → HTML aliases ──
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
    // ── SVG case-sensitive attributes ──
    // Foreign content parsing preserves case. Listed explicitly so `default`
    // can safely lowercase everything else for HTML.
    case "viewBox":
    case "clipPathUnits":
    case "gradientUnits":
    case "baseFrequency":
    case "numOctaves":
    case "stdDeviation":
    case "calcMode":
    case "repeatCount":
    case "repeatDur":
    case "pathLength":
    case "tableValues":
    case "maskUnits":
    case "markerWidth":
    case "markerHeight":
    case "markerUnits":
    case "patternUnits":
    case "patternContentUnits":
    case "primitiveUnits":
    case "filterUnits":
    case "spreadMethod":
    case "edgeMode":
    case "kernelMatrix":
    case "surfaceScale":
    case "diffuseConstant":
    case "specularConstant":
    case "specularExponent":
    case "limitingConeAngle":
    case "stitchTiles":
    case "preserveAlpha":
    case "preserveAspectRatio":
      return key;
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

// ── Attribute name resolution cache ─────────────────────────────────
//
// Resolving one attribute name means four independent lookups — the React
// alias gate, the alias table, the validity regex, and the URL-attribute set —
// and all four depend only on the *key*, never on the value. Since a codebase
// draws its attribute names from a small closed vocabulary (`class`, `id`,
// `href`, `data-*`, `aria-*`), the same four answers get recomputed on every
// single element.
//
// Caching them collapses the four into one Map hit. The regex is what makes
// this worth doing: `\p{C}` under `/u` forces Unicode table lookups, and it
// alone accounts for a third of buildAttrs (measured: 176 µs → 116 µs when
// removed, over 2000 calls). The cache recovers most of that — 176 µs → 125 µs
// — while keeping the regex as the single authority on validity.
interface AttrMeta {
  /** Resolved HTML name (`className` → `class`). */
  readonly name: string;
  readonly valid: boolean;
  readonly isUrl: boolean;
}

const ATTR_META = new Map<string, AttrMeta>();

// Keys can come from a caller-controlled `{...spread}`, so the cache must not
// grow without bound. Past the cap, resolution still happens — just uncached.
const ATTR_META_MAX = 1024;

function attrMeta(key: string): AttrMeta {
  let meta = ATTR_META.get(key);
  if (meta === undefined) {
    const name = RE_HAS_UPPER.test(key) ? resolveAttrName(key) : key;
    meta = { name, valid: isValidAttrName(name), isUrl: URL_ATTRIBUTES.has(name) };
    if (ATTR_META.size < ATTR_META_MAX) ATTR_META.set(key, meta);
  }
  return meta;
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
    // Nom résolu + validité + nature URL : un seul lookup mémoïsé (cf. attrMeta).
    const meta = attrMeta(key);
    const attrName = meta.name;
    // Si la clé est un alias React (className → class) et que la version
    // native est déjà dans les props, on garde la native.
    if (attrName !== key && attrName in attrs) continue;

    const value = attrs[key];
    if (value === null || value === undefined) continue;
    if (!meta.valid) continue;

    // ── Phase 2 : Sérialiser par type (string = hot path) ──
    const type = typeof value;

    // String — dominant case, coercion-free
    if (type === "string") {
      let str = value as string;
      if (meta.isUrl && !isSafeScheme(str)) str = "#blocked";
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
    if (meta.isUrl && !isSafeScheme(str)) str = "#blocked";
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
