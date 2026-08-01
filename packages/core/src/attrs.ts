import { escapeAttr, URL_ATTRIBUTES, isSafeScheme } from "./escape.js";
import { raw, RawString } from "./types.js";

// ── camelCase → kebab-case ──────────────────────────────────────────
// Shared by SVG attribute names and style property names — the same boundary
// rule, applied to two vocabularies. Declared here because the SVG table below
// is built from it at module load.

const RE_UPPERCASE = /[A-Z]/g;

const camelToKebab = (name: string): string =>
  name.replace(RE_UPPERCASE, (m) => "-" + m.toLowerCase());

// ── React → HTML attribute name resolution ──────────────────────────
//
// Three kinds of name, and only the last one is a rule:
//
//   1. **Aliases** — the HTML name shares no shape with the React one
//      (`className` → `class`, `httpEquiv` → `http-equiv`, `xlinkHref` →
//      `xlink:href`). A switch: JSC compiles string switches to a jump table.
//
//   2. **SVG names** — hyphenated in the spec (`strokeWidth` → `stroke-width`)
//      or camelCase in the spec (`viewBox`). This is data, not a rule: nothing
//      about `strokeWidth` distinguishes it from `tabIndex` except which
//      namespace it belongs to, and this function is not told the element. The
//      hyphenated set was missing entirely, so every SVG presentation attribute
//      written the way `@types/react` declares it — `strokeWidth`, `fillOpacity`,
//      `textAnchor`, seventy of them — was emitted as `strokewidth`, a name no
//      SVG parser knows. Silently: the attribute was simply ignored.
//
//   3. **Everything else lowercases.** HTML attribute names are case-insensitive,
//      and URL attributes (`href`, `src`, …) must be normalized before the scheme
//      check can look at them. This is why `tabIndex`, `readOnly`, `maxLength`,
//      `dateTime` and friends need no entry — their HTML name *is* the lowercased
//      form, and listing them was 11 cases restating the default.
//
// `attrMeta` memoizes the result per key, so this runs once per distinct
// attribute name in the process: the lookups below are cold, and readability wins
// over the jump table everywhere except the aliases that were already written.

/**
 * SVG attributes that are hyphenated in the spec, listed under the camelCase name
 * `@types/react` declares. The values are derived, not typed out, so the table
 * cannot contain a mistyped target — `attrs.test.ts` checks a sample against the
 * spec by hand, which is the part a derivation cannot verify about itself.
 */
const SVG_HYPHENATED: ReadonlyMap<string, string> = new Map(
  [
    "accentHeight",
    "alignmentBaseline",
    "arabicForm",
    "baselineShift",
    "capHeight",
    "clipPath",
    "clipRule",
    "colorInterpolation",
    "colorInterpolationFilters",
    "colorProfile",
    "colorRendering",
    "dominantBaseline",
    "enableBackground",
    "fillOpacity",
    "fillRule",
    "floodColor",
    "floodOpacity",
    "fontFamily",
    "fontSize",
    "fontSizeAdjust",
    "fontStretch",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "glyphName",
    "glyphOrientationHorizontal",
    "glyphOrientationVertical",
    "horizAdvX",
    "horizOriginX",
    "imageRendering",
    "letterSpacing",
    "lightingColor",
    "markerEnd",
    "markerMid",
    "markerStart",
    "overlinePosition",
    "overlineThickness",
    "paintOrder",
    "pointerEvents",
    "renderingIntent",
    "shapeRendering",
    "stopColor",
    "stopOpacity",
    "strikethroughPosition",
    "strikethroughThickness",
    "strokeDasharray",
    "strokeDashoffset",
    "strokeLinecap",
    "strokeLinejoin",
    "strokeMiterlimit",
    "strokeOpacity",
    "strokeWidth",
    "textAnchor",
    "textDecoration",
    "textRendering",
    "underlinePosition",
    "underlineThickness",
    "unicodeBidi",
    "unicodeRange",
    "unitsPerEm",
    "vAlphabetic",
    "vHanging",
    "vIdeographic",
    "vMathematical",
    "vectorEffect",
    "vertAdvY",
    "vertOriginX",
    "vertOriginY",
    "wordSpacing",
    "writingMode",
    "xHeight",
  ].map((key) => [key, camelToKebab(key)]),
);

/**
 * SVG attributes that are camelCase *in the spec*. Foreign-content parsing
 * preserves case, so lowercasing `viewBox` to `viewbox` breaks it exactly the way
 * lowercasing `strokeWidth` does.
 */
const SVG_CASE_SENSITIVE: ReadonlySet<string> = new Set([
  "allowReorder",
  "attributeName",
  "attributeType",
  "autoReverse",
  "baseFrequency",
  "baseProfile",
  "calcMode",
  "clipPathUnits",
  "contentScriptType",
  "contentStyleType",
  "diffuseConstant",
  "edgeMode",
  "externalResourcesRequired",
  "filterRes",
  "filterUnits",
  "glyphRef",
  "gradientTransform",
  "gradientUnits",
  "kernelMatrix",
  "kernelUnitLength",
  "keyPoints",
  "keySplines",
  "keyTimes",
  "lengthAdjust",
  "limitingConeAngle",
  "markerHeight",
  "markerUnits",
  "markerWidth",
  "maskContentUnits",
  "maskUnits",
  "numOctaves",
  "pathLength",
  "patternContentUnits",
  "patternTransform",
  "patternUnits",
  "pointsAtX",
  "pointsAtY",
  "pointsAtZ",
  "preserveAlpha",
  "preserveAspectRatio",
  "primitiveUnits",
  "refX",
  "refY",
  "repeatCount",
  "repeatDur",
  "requiredExtensions",
  "requiredFeatures",
  "specularConstant",
  "specularExponent",
  "spreadMethod",
  "startOffset",
  "stdDeviation",
  "stitchTiles",
  "surfaceScale",
  "systemLanguage",
  "tableValues",
  "targetX",
  "targetY",
  "textLength",
  "viewBox",
  "viewTarget",
  "xChannelSelector",
  "yChannelSelector",
  "zoomAndPan",
]);

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
    case "xmlnsXlink":
      return "xmlns:xlink";
    case "xmlLang":
      return "xml:lang";
    case "xmlBase":
      return "xml:base";
    case "xmlSpace":
      return "xml:space";
    // The `xlink:` family. Only `xlinkHref` was mapped; the other six became
    // `xlinkactuate`, `xlinktitle`, … — attributes with no meaning at all.
    case "xlinkActuate":
      return "xlink:actuate";
    case "xlinkArcrole":
      return "xlink:arcrole";
    case "xlinkHref":
      return "xlink:href";
    case "xlinkRole":
      return "xlink:role";
    case "xlinkShow":
      return "xlink:show";
    case "xlinkTitle":
      return "xlink:title";
    case "xlinkType":
      return "xlink:type";
  }
  const hyphenated = SVG_HYPHENATED.get(key);
  if (hyphenated !== undefined) return hyphenated;
  if (SVG_CASE_SENSITIVE.has(key)) return key;
  return key.toLowerCase();
}

/** @internal Exposed for the consistency checks in `attrs.test.ts`. */
export const ATTR_NAME_TABLES = { SVG_HYPHENATED, SVG_CASE_SENSITIVE };

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
// alone accounts for a third of buildAttrs — removing it roughly halves the
// time over 2000 calls, and the cache recovers most of that while keeping the
// regex as the single authority on validity.
export interface AttrMeta {
  /** Resolved HTML name (`className` → `class`). */
  readonly name: string;
  readonly valid: boolean;
  readonly isUrl: boolean;
}

const ATTR_META = new Map<string, AttrMeta>();

// Keys can come from a caller-controlled `{...spread}`, so the cache must not
// grow without bound. Past the cap, resolution still happens — just uncached.
const ATTR_META_MAX = 1024;

/**
 * Everything about an attribute *name*, memoized.
 *
 * Shared with `jsxAttr`, which used to call `resolveAttrName`, `isValidAttrName`
 * and `URL_ATTRIBUTES.has` itself, uncached, on every attribute of every element
 * — the `\p{C}` regex again. One question, one place, one cache.
 */
export function attrMeta(key: string): AttrMeta {
  let meta = ATTR_META.get(key);
  if (meta === undefined) {
    const name = RE_HAS_UPPER.test(key) ? resolveAttrName(key) : key;
    meta = { name, valid: isValidAttrName(name), isUrl: URL_ATTRIBUTES.has(name) };
    if (ATTR_META.size < ATTR_META_MAX) ATTR_META.set(key, meta);
  }
  return meta;
}

// ── Event handlers ───────────────────────────────────────────────────────
//
// There is no branch for them, on purpose. `onclick="submit()"` is valid HTML and
// a developer is allowed to write it; the type dispatch below already says
// everything there is to say — a string serializes escaped, a function throws
// because a function cannot be serialized to HTML at all, whatever it is called.
//
// Discouraging the practice belongs to `@vincle/eslint-plugin`'s
// `no-unsafe-event-handlers`, which says it once at the source. A renderer that
// emits the same tree thousands of times a second is the wrong place for advice:
// a per-render `console.warn` is a log flood, and it costs on the hot path.
//
// `jsx-runtime.ts` used to special-case them on the precompile path — dropping
// `onClick={fn}` with a `console.warn` where this path threw — so the same
// component crashed or rendered depending on whether the Vite precompile plugin
// was enabled. That branch is gone; both paths now run the dispatch below.

// ── Serialize one attribute value ───────────────────────────────────
//
// The value taxonomy for an HTML attribute, in test order — see CONTEXT.md
// for the history of the divergent copies.
//
// Returns `raw("")` when the attribute must not be emitted (reserved key, null
// value, invalid name) so a caller without a loop — the precompile transform —
// has nothing to filter. Batch callers keep their own `continue` policy on top:
// skipping the call is cheaper than filtering the result.
//
// Deliberately synchronous: a promised value is an async *policy* of the
// caller, not part of the value taxonomy.

/**
 * Serialize one attribute value to a `name="value"` fragment, with no leading
 * space. Throws on a function value — a function cannot be serialized to HTML,
 * whatever it is called.
 */
export function serializeAttr(key: string, value: unknown): RawString {
  if (value === null || value === undefined) return raw("");
  if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML")
    return raw("");

  // One memoized lookup for the resolved name, its validity and whether it is a
  // URL attribute — asking the three questions separately was measurably
  // slower, and sharing the cache also makes it impossible for two paths to
  // resolve a name differently.
  //
  // The validity gate matters on this path as much as on the batch one: a name
  // reaching a runtime helper is not necessarily author-written — a spread, a
  // computed key, or a transform that does not bail on spreads the way
  // `@vincle/precompile-core` does, all put caller-controlled text here.
  const meta = attrMeta(key);
  if (!meta.valid) return raw("");
  const attrName = meta.name;

  const type = typeof value;

  // String — dominant case, coercion-free
  if (type === "string") {
    let str = value as string;
    if (meta.isUrl && !isSafeScheme(str)) str = "#blocked";
    return new RawString(`${attrName}="${escapeAttr(str)}"`);
  }

  // Boolean — HTML booléen → nom seul, sinon stringifié
  if (type === "boolean") {
    if (BOOLEAN_ATTRIBUTES.has(attrName)) return value ? raw(attrName) : raw("");
    return new RawString(`${attrName}="${value}"`);
  }

  // number / bigint — safe, pas de check URL
  if (type === "number" || type === "bigint") {
    return new RawString(`${attrName}="${value}"`);
  }

  // Function — ne peut pas être sérialisé. Pas de branche `on…` : un handler
  // est un attribut comme un autre, et une fonction est unserialisable quoi
  // qu'elle s'appelle. La dissuasion appartient à `@vincle/eslint-plugin`'s
  // `no-unsafe-event-handlers`, pas au moteur (un `console.warn` par rendu
  // serait un flood de logs sur le hot path).
  if (type === "function") {
    throw new Error(
      `[vincle/core] Attribute "${key}" received a function as value. ` +
        "Functions are not serializable to HTML. Did you forget to call a component or pass a string?",
    );
  }

  // RawString — bypass explicite du développeur. Testé avant `style`/`class` :
  // un RawString *est* un objet, donc le tester après ferait itérer ses propres
  // clés comme si c'était un sac de styles —
  // `style={raw("color:red")}` sortait `style="value:color:red"`.
  if (value instanceof RawString) {
    return new RawString(`${attrName}="${value.value}"`);
  }

  // Style objet → chaîne CSS. Seul un objet *simple* est un sac de styles :
  // `styleToString` énumère les clés propres, ce qui ne veut rien dire pour une
  // instance de classe (`style={new Date()}` produisait un attribut vide,
  // supprimé en silence). Tout le reste retombe sur `String(value)`, comme
  // n'importe quel autre attribut.
  if (attrName === "style" && isPlainObject(value)) {
    const styleStr = styleToString(value as Record<string, string | number | null | undefined>);
    if (!styleStr) return raw("");
    return new RawString(`style="${escapeAttr(styleStr)}"`);
  }

  // Array class → string join
  if (attrName === "class" && Array.isArray(value)) {
    const s = classToString(value as unknown[]);
    if (!s) return raw("");
    return new RawString(`class="${escapeAttr(s)}"`);
  }

  // Fallback — tout objet avec toString
  let str = String(value);
  if (meta.isUrl && !isSafeScheme(str)) str = "#blocked";
  return new RawString(`${attrName}="${escapeAttr(str)}"`);
}

// ── Build attributes string ────────────────────────────────────────
//
// Inline à dessein : `serializeAttr` délègue ici à un appel de fonction par
// attribut, et le fold paie 13–16 % (8 runs). C'est
// l'allocation `RawString` par attribut qui coûte, pas la branche : le fold
// concatène, `serializeAttr` construit. Ne pas ré-extraire sans re-mesurer.
//
// La taxonomie des valeurs vit donc en deux exemplaires — ici, inline, et dans
// `serializeAttr`, que `jsxAttr` (precompile) délègue. Le reste (attrMeta,
// styleToString, classToString, isPlainObject, BOOLEAN_ATTRIBUTES, escapeAttr,
// isSafeScheme) est partagé : les deux chemins ne peuvent pas dériver sur les
// tables, seulement sur l'ordre des branches — et l'équivalence est pinnée par
// les tests d'attributs de `attrs.test.ts` et `jsx-precompile-runtime.test.ts`.

export function buildAttrs(attrs: Record<string, unknown>): string | Promise<string> {
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
    // `Object.hasOwn`, pas `in` : `in` traverse le prototype, donc un attribut
    // dont le nom résolu tombe sur une clé d'`Object.prototype` était supprimé
    // en silence (`<div Constructor="x" />` → aucun attribut émis).
    if (attrName !== key && Object.hasOwn(attrs, attrName)) continue;

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

    // Promise — une valeur d'attribut peut être awaitable, comme le déclarent
    // `class`, `style` et `htmlFor` dans `types.ts`. Le `String(value)` du
    // fallback en faisait `[object Promise]` : le type promettait ce que le
    // moteur ne faisait pas, et `jsxAttr` — qui l'awaitait déjà — divergeait.
    // On repart à zéro en asynchrone : deux passes sur un cas rare, contre une
    // branche de plus dans une boucle qui tourne sur chaque élément.
    if (value instanceof Promise) return buildAttrsAsync(attrs);

    // RawString — bypass explicite du développeur.
    // Avant `style`/`class` : un RawString *est* un objet, donc le tester après
    // faisait itérer ses propres clés comme si c'était un sac de styles —
    // `style={raw("color:red")}` sortait `style="value:color:red"`. `jsxAttr` a
    // toujours testé dans cet ordre ; les deux chemins concordent désormais.
    if (value instanceof RawString) {
      out += ` ${attrName}="${value.value}"`;
      continue;
    }

    // Style objet → chaîne CSS. Seul un objet *simple* est un sac de styles :
    // `styleToString` énumère les clés propres, ce qui ne veut rien dire pour une
    // instance de classe (`style={new Date()}` produisait un attribut vide,
    // supprimé en silence). Tout le reste retombe sur `String(value)`, comme
    // n'importe quel autre attribut.
    if (attrName === "style" && isPlainObject(value)) {
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

    // Fallback — tout objet avec toString
    let str = String(value);
    if (meta.isUrl && !isSafeScheme(str)) str = "#blocked";
    out += ` ${attrName}="${escapeAttr(str)}"`;
  }

  return out;
}

/**
 * Await every promised attribute value, then serialize normally.
 *
 * Resolving into a copy and re-entering `buildAttrs` — rather than resuming the
 * loop — is what guarantees the bytes are the same whether or not an attribute
 * happened to be a promise: there is one serializer, and it is the one above.
 * Sequential awaits, like the child walk in `render.ts`: attribute order is
 * document order.
 */
async function buildAttrsAsync(attrs: Record<string, unknown>): Promise<string> {
  const resolved: Record<string, unknown> = {};
  for (const key in attrs) {
    const value = attrs[key];
    resolved[key] = value instanceof Promise ? await value : value;
  }
  // `resolved` holds no promise, so this cannot ask to be awaited again — and
  // `await` says so without a cast having to be believed.
  return await buildAttrs(resolved);
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
//
// `styleToString` enumerates own keys, which only means something for an object
// literal. `isPlainObject` is the gate: an array, a `RawString`, a `Date` or any
// class instance is not a bag of declarations and must not be read as one.
export function isPlainObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

//
// A property *name* carrying `:` or `;` smuggles extra declarations into the
// attribute: `{ "color:red;position": "fixed" }` used to serialize as
// `style="color:red;position:fixed"`. `escapeAttr` prevents breaking out of the
// attribute, so this cannot become script — but it can become arbitrary CSS on
// the element (overlay, `position:fixed`, clickjacking) whenever the keys come
// from data rather than from source. Names are a closed vocabulary; values are
// not, and are left alone.
const RE_INVALID_STYLE_PROP = /[;:{}<>"'\s]|\p{C}/u;

export function styleToString(obj: Record<string, string | number | null | undefined>): string {
  let out = "";
  for (const key in obj) {
    const value = obj[key];
    if (value === null || value === undefined) continue;
    const prop = camelToKebab(key);
    if (RE_INVALID_STYLE_PROP.test(prop)) continue;
    if (out) out += ";";
    out += `${prop}:${value}`;
  }
  return out;
}
