import { escapeAttr, URL_ATTRIBUTES, isSafeScheme } from "./escape.js";
import { raw, RawString } from "./types.js";

// ── camelCase → kebab-case ──────────────────────────────────────────
// Shared by SVG attribute names and style property names — the same boundary
// rule, applied to two vocabularies. Declared here because the SVG table below
// is built from it at module load.

const RE_UPPERCASE = /[A-Z]/g;

const camelToKebab = (name: string): string =>
  name.replace(RE_UPPERCASE, (m) => "-" + m.toLowerCase());

// Three name families, one of which is a rule: React aliases (`className` →
// `class`), SVG names (data, since `strokeWidth` vs `tabIndex` needs the
// element to tell apart), and everything else, lowercased. `attrMeta` memoizes
// the lookup.

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
const BOOLEAN_ATTRIBUTES = new Set([
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

// Reject attribute names that can break out of a tag: whitespace, `"`, `'`,
// `<`, `>`, `/`, `=`, control chars — the HTML spec's forbidden set. A backtick
// is *not* in it: it is legal in a name, and only ever acted as a quote in
// attribute *values*, in browsers no longer shipped. `isValidTag` is stricter
// (it also rejects `` ` `` and `\`) because a tag name is a wider surface.
const RE_INVALID_ATTR_NAME = /[\s"'<>/=\p{C}]/u;

export function isValidAttrName(name: string): boolean {
  // The empty name emits ` ="v"`, which a parser reads as an attribute called
  // `="v"` — no injection, but nothing anyone wrote either.
  return name.length > 0 && !RE_INVALID_ATTR_NAME.test(name);
}

// Resolving a name means four lookups depending only on the key (alias gate,
// alias table, validity regex, URL-attribute set), recomputed per element from
// a small closed vocabulary. `attrMeta` collapses them into one Map hit — worth
// it mainly because `\p{C}` under `/u` forces Unicode table lookups and alone
// costs about a third of `buildAttrs`.
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

// No dedicated branch for event handlers: a string serializes escaped, a
// function throws, same as any other attribute. Discouraging the practice is
// `@vincle/eslint-plugin`'s job, not the hot path's.

/**
 * One message for both serialization paths (`serializeAttr`, `buildAttrs`), so
 * the precompile and dynamic routes can never drift apart on what a function
 * attribute means and how to fix it.
 */
function functionAttrMessage(key: string): string {
  return (
    `[vincle/core] Attribute "${key}" received a function as value — functions are not serializable to HTML. ` +
    "If this is an event handler, note that vincle renders on the server: handlers cannot ship in markup. " +
    "Pass a string, call the function first, or drop the attribute."
  );
}

/**
 * A `RawString` used as an *attribute* value, emitted verbatim except for `"`.
 *
 * `raw()` means "trusted markup", which is not the same promise as "trusted
 * attribute value": the one character a double-quoted value cannot hold is the
 * quote that ends it, and `title={raw('" onmouseover="alert(1)')}` closed the
 * attribute and reopened the tag. Escaping only that one keeps `raw()` verbatim
 * where it counts — an attribute value is entity-decoded before it reaches CSS,
 * JS or the DOM, so `style={raw('font-family:"Foo"')}` still means what it says.
 */
function rawAttrValue(value: string): string {
  return value.includes('"') ? value.replaceAll('"', "&quot;") : value;
}

/**
 * Serialize one attribute value to a `name="value"` fragment, with no leading
 * space. Synchronous: a promised value is the caller's policy, not part of the
 * value taxonomy.
 *
 * @example
 * ```ts
 * serializeAttr("className", "card").value;      // 'class="card"'
 * serializeAttr("disabled", true).value;         // 'disabled'
 * serializeAttr("href", "javascript:x").value;   // '' — scheme refused
 * serializeAttr("children", x).value;            // '' — reserved key
 * ```
 *
 * @returns `raw("")` when the attribute must not be emitted, so a caller with no
 *   loop has nothing to filter.
 * @throws on a function value — a function cannot be serialized to HTML.
 */
export function serializeAttr(key: string, value: unknown): RawString {
  if (value === null || value === undefined) return raw("");
  if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML")
    return raw("");

  // The validity gate matters here as much as in the batch path: a name reaching
  // a runtime helper may be caller-controlled (spread, computed key), not
  // author-written.
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

  // Boolean — HTML boolean → name alone, else stringified
  if (type === "boolean") {
    if (BOOLEAN_ATTRIBUTES.has(attrName)) return value ? raw(attrName) : raw("");
    return new RawString(`${attrName}="${value}"`);
  }

  if (type === "number" || type === "bigint") {
    return new RawString(`${attrName}="${value}"`);
  }

  // A function can't be serialized; discouraging it is
  // `no-unsafe-event-handlers`'s job, not a per-render console.warn here.
  if (type === "function") {
    throw new Error(functionAttrMessage(key));
  }

  // Checked before style/class: a RawString is an object, so testing it after
  // would iterate its own keys as if it were a style bag.
  if (value instanceof RawString) {
    return new RawString(`${attrName}="${rawAttrValue(value.value)}"`);
  }

  // Only a plain object is a style bag — a class instance (`style={new Date()}`)
  // isn't, and falls through to `String(value)` like any other attribute.
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

  // Fallback — any other object, via toString
  let str = String(value);
  if (meta.isUrl && !isSafeScheme(str)) str = "#blocked";
  return new RawString(`${attrName}="${escapeAttr(str)}"`);
}

// Same taxonomy as `serializeAttr`, duplicated on purpose: delegating costs
// 13–16 % (8 runs) since each attribute would then allocate a `RawString`.
// Don't re-extract without re-measuring. Tables stay shared, so the two paths
// can only diverge in branch order — pinned by `attrs.test.ts` and
// `jsx-precompile-runtime.test.ts`.

export function buildAttrs(attrs: Record<string, unknown>): string | Promise<string> {
  let out = "";

  for (const key in attrs) {
    // Own properties only. `for…in` walks the prototype, so an enumerable
    // property on `Object.prototype` — what a prototype-pollution bug in the
    // application writes — became an attribute on every element rendered.
    if (!Object.hasOwn(attrs, key)) continue;
    if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML")
      continue;
    const meta = attrMeta(key);
    const attrName = meta.name;
    // `Object.hasOwn`, not `in`: `in` traverses the prototype, so an attribute
    // resolving to an `Object.prototype` key (`<div Constructor="x" />`) was
    // silently dropped instead of falling back to the native one already present.
    if (attrName !== key && Object.hasOwn(attrs, attrName)) continue;

    const value = attrs[key];
    if (value === null || value === undefined) continue;
    if (!meta.valid) continue;

    const type = typeof value;

    if (type === "string") {
      let str = value as string;
      if (meta.isUrl && !isSafeScheme(str)) str = "#blocked";
      out += ` ${attrName}="${escapeAttr(str)}"`;
      continue;
    }

    if (type === "boolean") {
      if (BOOLEAN_ATTRIBUTES.has(attrName)) {
        if (value) out += ` ${attrName}`;
      } else {
        out += ` ${attrName}="${value}"`;
      }
      continue;
    }

    if (type === "number" || type === "bigint") {
      out += ` ${attrName}="${value}"`;
      continue;
    }

    if (type === "function") {
      throw new Error(functionAttrMessage(key));
    }

    // Restarts fully async rather than resuming the loop: two passes on a rare
    // case beats one more branch on every element, and it's what keeps the
    // fallback from stringifying an unresolved promise to `[object Promise]`.
    if (value instanceof Promise) return buildAttrsAsync(attrs);

    // Before style/class: a RawString is an object, so testing it after would
    // iterate its own keys as if it were a style bag.
    if (value instanceof RawString) {
      out += ` ${attrName}="${rawAttrValue(value.value)}"`;
      continue;
    }

    if (attrName === "style" && isPlainObject(value)) {
      const styleStr = styleToString(value as Record<string, string | number | null | undefined>);
      if (styleStr) out += ` style="${escapeAttr(styleStr)}"`;
      continue;
    }

    if (attrName === "class" && Array.isArray(value)) {
      const s = classToString(value as unknown[]);
      if (!s) continue;
      out += ` class="${escapeAttr(s)}"`;
      continue;
    }

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
    if (!Object.hasOwn(attrs, key)) continue;
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
function isPlainObject(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

// A property *name* carrying `:` or `;` injects declarations —
// `{ "color:red;position": "fixed" }` became `style="color:red;position:fixed"`.
// No script, but arbitrary CSS (clickjacking) once keys come from data.
const RE_INVALID_STYLE_PROP = /[;:{}<>"'\s]|\p{C}/u;

// A *value* carrying `;` injects them just the same — `{ color: data }` with
// `data = "red;position:fixed"`. Values are repaired rather than dropped:
// `url(data:image/png;base64,…)` is a legitimate value, and CSS reads `\;`
// back as `;`, so escaping changes nothing a browser parses. The backslash is
// escaped by the same pass — otherwise a smuggled `red\;` would survive as a
// live separator. Control characters have no business in a value at all and
// are dropped, like invalid names.
const RE_UNSAFE_STYLE_VALUE = /[\\;\p{Cc}]/u;
const RE_STYLE_VALUE_CONTROLS = /\p{Cc}/u;
const RE_STYLE_VALUE_ESCAPE = /[\\;]/g;

/**
 * A style property name, kebab-cased — with the one vendor prefix `camelToKebab`
 * cannot reach: `ms` is the only one spelled lowercase, so `msFlexAlign` came out
 * `ms-flex-align` instead of `-ms-flex-align`. Same rule as React's
 * `hyphenateStyleName`; `WebkitBoxOrient` and `--custom-prop` are already right.
 */
function styleProp(key: string): string {
  const kebab = camelToKebab(key);
  return kebab.startsWith("ms-") ? "-" + kebab : kebab;
}

function styleToString(obj: Record<string, string | number | null | undefined>): string {
  let out = "";
  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) continue; // same prototype rule as `buildAttrs`
    const value = obj[key];
    if (value === null || value === undefined) continue;
    const prop = styleProp(key);
    if (RE_INVALID_STYLE_PROP.test(prop)) continue;
    const str = typeof value === "string" ? value : String(value);
    if (RE_UNSAFE_STYLE_VALUE.test(str)) {
      if (RE_STYLE_VALUE_CONTROLS.test(str)) continue;
      if (out) out += ";";
      out += `${prop}:${str.replace(RE_STYLE_VALUE_ESCAPE, "\\$&")}`;
      continue;
    }
    if (out) out += ";";
    out += `${prop}:${str}`;
  }
  return out;
}
