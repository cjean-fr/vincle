import { ERR_ANIMATED_HANDLER, ERR_FUNCTION_ATTR, vincleError } from "./errors.js";
import { escapeAttr, isSafeScheme } from "./escape.js";
import { isAnimationTag } from "./tag.js";
import { raw, RawString, RawUrl } from "./types.js";

// ── camelCase → kebab-case ──────────────────────────────────────────
// Shared by SVG attribute names and style property names: the same boundary
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
 * SVG attributes that are hyphenated in the spec, listed under the camelCase
 * name `@types/react` declares. The values are derived, not typed out, so the table
 * cannot contain a mistyped target: `attrs.test.ts` checks a sample against the
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
    // The whole `xlink:` family: lowercasing any of these gives `xlinkactuate`,
    // `xlinktitle`, …: attributes with no meaning at all.
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

// ── Attributes whose value is a URL ──────────────────────────────────
//
// Read by name, at every layer: the runtime judges the value, the precompile
// transform runs static ones through the same `jsxAttr` at build time, and
// `no-javascript-urls` asks the same question at author time. One set is what
// keeps the three from answering differently.

export const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  // `<object data>` / `<embed src>` navigate the same way `<iframe src>` does;
  // `data` is the only one of the two not already covered by `src`.
  "data",
]);

/**
 * The four attributes an animation writes its target through.
 *
 * `<animate attributeName="href" values="javascript:…">` is a `href` the source
 * never spells: the URL lands on a navigable attribute when the animation runs
 * rather than when the page is parsed, and every browser honours it (`href`
 * unconditionally, `xlink:href` given an explicit `xmlns:xlink`). A name-only
 * filter never saw them, so on an animation element these four are judged as
 * URLs by `buildAttrs`, which is the one place holding both the tag and the bag.
 * Item by item: `values` is a `;`-separated list the animation applies in turn,
 * so `"#;javascript:…"` is two URLs, and a whole-string check sees neither.
 *
 * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#built-in-animating-url-attributes-list
 */
export const ANIMATED_URL_ATTRIBUTES: ReadonlySet<string> = new Set(["values", "to", "from", "by"]);

// Leading whitespace admitted: over-matching a name no browser would resolve
// costs nothing, under-matching one it would is the bypass.
const RE_EVENT_HANDLER_NAME = /^[\t\n\f\r ]*on/i;

/**
 * Is this name an event handler (`onclick`, `onmouseover`, …)?
 *
 * The one case a URL check cannot reach. `<set attributeName="onmouseover"
 * to="alert(1)">` writes a handler onto an element that never had one, from a
 * value that reads as data — and `alert(1)` carries no scheme, so it walks past
 * every URL gate there is. The name gives it away, and it is the author's own
 * literal: unlike the value, there is no provenance to argue about.
 */
export function isEventHandlerName(name: string): boolean {
  return RE_EVENT_HANDLER_NAME.test(name);
}

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
// `<`, `>`, `/`, `=`, control chars: the HTML spec's forbidden set. A backtick
// is *not* in it: it is legal in a name, and only ever acted as a quote in
// attribute *values*, in browsers no longer shipped. `isValidTag` is stricter
// (it also rejects `` ` `` and `\`) because a tag name is a wider surface.
const RE_INVALID_ATTR_NAME = /[\s"'<>/=\p{C}]/u;

export function isValidAttrName(name: string): boolean {
  // The empty name emits ` ="v"`, which a parser reads as an attribute called
  // `="v"`: no injection, but nothing anyone wrote either.
  return name.length > 0 && !RE_INVALID_ATTR_NAME.test(name);
}

// Resolving a name means four lookups depending only on the key (alias gate,
// alias table, validity regex, URL-attribute set), recomputed per element from
// a small closed vocabulary. `attrMeta` collapses them into one Map hit: worth
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
// grow without bound. Past the cap, resolution still happens: just uncached.
const ATTR_META_MAX = 1024;

/**
 * @internal Shared with vincle's own tooling (`@vincle/precompile`,
 * `@vincle/eslint-plugin`) via `@vincle/core/html`, not app-level API.
 *
 * Everything about an attribute *name*, memoized.
 *
 * Shared with `jsxAttr`: `resolveAttrName`, `isValidAttrName` and the URL
 * question are evaluated once per name here. That includes the `\p{C}` regex,
 * which would otherwise run for every attribute at each call site. One question,
 * one place, one cache.
 *
 * The URL answer is the name's own, and nothing else: whether `values` carries a
 * URL depends on the element it sits on, which `attrMeta` is not given. See
 * {@link ANIMATED_URL_ATTRIBUTES} for the pair that needs both.
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
// `@vincle/eslint-plugin`'s job, not the hot path's — what escapes a handler
// written as one is the same `escapeAttr` as any other value. The one handler
// this module refuses is the one nobody wrote: an animation that assembles one
// out of a value, in `animationWritesUrls`.

/** How `attrFragment` judges a value: not at all, as one URL, as a `;` list of them. */
type UrlCheck = typeof NOT_URL | typeof ONE_URL | typeof URL_LIST;
const NOT_URL = 0;
const ONE_URL = 1;
const URL_LIST = 2;

/** A `URL_LIST` is blocked whole when any item is: the animation reaches each in turn. */
function isSafeUrl(str: string, url: typeof ONE_URL | typeof URL_LIST): boolean {
  if (url === ONE_URL) return isSafeScheme(str);
  for (const item of str.split(";")) if (!isSafeScheme(item.trim())) return false;
  return true;
}

/**
 * One message for both serialization paths (`serializeAttr`, `buildAttrs`), so
 * the precompile and dynamic routes can never drift apart on what a function
 * attribute means and how to fix it.
 */
function functionAttrMessage(key: string): string {
  return `[vincle/core] Attribute "${key}" got a function, not serializable to HTML. Pass a string, or drop it.`;
}

/**
 * A `RawString` used as an *attribute* value, emitted verbatim except for `"`.
 *
 * `raw()` means "trusted markup", which is not the same promise as "trusted
 * attribute value": the one character a double-quoted value cannot hold is the
 * quote that ends it: `title={raw('" onmouseover="alert(1)')}` would close the
 * attribute and reopen the tag. Escaping only that one keeps `raw()` verbatim
 * where it counts: an attribute value is entity-decoded before it reaches CSS,
 * JS or the DOM, so `style={raw('font-family:"Foo"')}` still means what it says.
 */
function rawAttrValue(value: string): string {
  return value.includes('"') ? value.replaceAll('"', "&quot;") : value;
}

/**
 * The attribute *value* taxonomy: one value, already past its caller's gates, to
 * the text that carries it into a start tag. `prefix` is the separator the
 * caller needs: a space inside a tag, nothing for a standalone fragment, and
 * is emitted only when the attribute is, so a value that serializes to nothing
 * leaves no stray space behind.
 *
 * Both serialization paths call this, rather than each stating the taxonomy. The
 * order of these branches is load-bearing (a `RawString` is an object and must
 * be recognised before the style bag), and two copies of an order can drift the
 * same way on the same day, which an equivalence test, comparing them only to
 * each other, would not see.
 *
 * It returns text, not a `RawString`: the 13–16% that once paid for the copy was
 * an object allocated per attribute, not the call. A string fragment is what the
 * caller was building anyway.
 *
 * `url` is a parameter, not `meta.isUrl`, because one case is not the name's
 * own: on an animation element, `values`/`to`/`from`/`by` carry the URL of the
 * attribute named by a sibling. The element decides (`buildAttrs`), this obeys.
 *
 * @throws on a function value: a function cannot be serialized to HTML.
 */
function attrFragment(
  key: string,
  meta: AttrMeta,
  value: unknown,
  prefix: string,
  url: UrlCheck,
): string {
  const attrName = meta.name;
  const type = typeof value;

  // Frequency order, from here down.
  if (type === "string") {
    let str = value as string;
    if (url !== NOT_URL && !isSafeUrl(str, url)) str = "#blocked";
    return `${prefix}${attrName}="${escapeAttr(str)}"`;
  }

  if (type === "boolean") {
    if (BOOLEAN_ATTRIBUTES.has(attrName)) return value ? `${prefix}${attrName}` : "";
    return `${prefix}${attrName}="${value}"`;
  }

  if (type === "number" || type === "bigint") {
    return `${prefix}${attrName}="${value}"`;
  }

  // A function can't be serialized; discouraging it is
  // `no-unsafe-event-handlers`'s job, not a per-render console.warn here.
  if (type === "function") {
    throw vincleError(functionAttrMessage(key), ERR_FUNCTION_ATTR);
  }

  // Checked before style/class: a RawString is an object, so testing it after
  // would iterate its own keys as if it were a style bag.
  if (value instanceof RawString) {
    return `${prefix}${attrName}="${rawAttrValue(value.value)}"`;
  }

  // A trusted scheme, and nothing else: the value is still escaped, so unlike
  // `raw()` this cannot be used to smuggle markup, and a `RawUrl` on a
  // non-URL attribute is just a string. The branch answers no position
  // differently, which is why it needs no `url`.
  if (value instanceof RawUrl) {
    return `${prefix}${attrName}="${escapeAttr(value.value)}"`;
  }

  // Only a plain object is a style bag: a class instance (`style={new Date()}`)
  // isn't, and falls through to `String(value)` like any other attribute.
  if (attrName === "style" && isPlainObject(value)) {
    const styleStr = styleToString(value as Record<string, string | number | null | undefined>);
    return styleStr ? `${prefix}style="${escapeAttr(styleStr)}"` : "";
  }

  if (attrName === "class" && Array.isArray(value)) {
    const s = classToString(value as unknown[]);
    return s ? `${prefix}class="${escapeAttr(s)}"` : "";
  }

  let str = String(value);
  if (url !== NOT_URL && !isSafeUrl(str, url)) str = "#blocked";
  return `${prefix}${attrName}="${escapeAttr(str)}"`;
}

/**
 * Serialize one attribute to a bare `name="value"` fragment.
 *
 * No separating space: `jsxAttr` hands this to a precompile template whose
 * static text already carries one. `buildAttrs` passes `" "` straight to
 * `attrFragment` instead, since it writes a whole start tag itself.
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

  // `meta.isUrl` and nothing more: one attribute, no tag, no bag. The case that
  // needs all three is an animation, and `@vincle/precompile` hands those back to
  // the runtime rather than inlining them — which is the only way this can be
  // true for both paths.
  return new RawString(attrFragment(key, meta, value, "", meta.isUrl ? ONE_URL : NOT_URL));
}

export function buildAttrs(attrs: Record<string, unknown>, tag: string): string | Promise<string> {
  // An animation writes `to`/`from`/`by`/`values` onto whatever `attributeName`
  // names, so for those four the element — not the name — says whether the value
  // is a URL. Asked once, before the loop: a switch on the tag, then nothing
  // else unless this element is one of the five that animate.
  const animateUrls = isAnimationTag(tag) && animationWritesUrls(attrs);

  let out = "";

  for (const key in attrs) {
    // Own properties only. `for…in` walks the prototype, so an enumerable
    // property on `Object.prototype`: what a prototype-pollution bug in the
    // application writes: would be an attribute on every element rendered.
    if (!Object.hasOwn(attrs, key)) continue;
    if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML")
      continue;
    const meta = attrMeta(key);
    const attrName = meta.name;
    // `Object.hasOwn`, not `in`: `in` traverses the prototype, so an attribute
    // resolving to an `Object.prototype` key (`<div Constructor="x" />`) is
    // dropped instead of falling back to the native one already present.
    if (attrName !== key && Object.hasOwn(attrs, attrName)) continue;

    const value = attrs[key];
    if (value === null || value === undefined) continue;
    if (!meta.valid) continue;

    // The one shape the fragment taxonomy does not answer, because the answer is
    // not a fragment. Restart fully async rather than resume the loop. Two
    // passes on a rare case beat one more branch on every element, and that is
    // what keeps the fallback from stringifying a pending promise to
    // `[object Promise]`.
    if (value instanceof Promise) return buildAttrsAsync(attrs, tag);

    out += attrFragment(
      key,
      meta,
      value,
      " ",
      meta.isUrl
        ? ONE_URL
        : animateUrls && ANIMATED_URL_ATTRIBUTES.has(attrName)
          ? URL_LIST
          : NOT_URL,
    );
  }

  return out;
}

/**
 * Does this animation write its values onto a URL attribute, so they must be
 * judged as URLs?
 *
 * Two attributes deciding one thing is why this cannot live in `attrMeta`, and
 * why `@vincle/precompile` hands animation elements back to the runtime rather
 * than inlining them one attribute at a time: a name-only question has no answer
 * here, and guessing at one would be a second copy of the rule to keep in step.
 *
 * Called only once `isAnimationTag` has said yes, and the caller asks that
 * inline: every element rendered pays the tag question, which rejects on the
 * first character and the length, and only the five animation tags pay the walk.
 *
 * Names are judged resolved, as `buildAttrs` serializes them: `VALUES` is
 * emitted as `values`, and `attributename` is the `attributeName` the parser
 * adjusts it to. Own keys only, for the reason `buildAttrs` asks `hasOwn`: a
 * polluted `Object.prototype.attributeName` would otherwise make every
 * animation in the process throw.
 *
 * A target that is not a string literal is judged as a URL too, rather than
 * skipped: the element says it is animating *something*, and only the runtime
 * can find out what. Treating the unknown target as the dangerous one is the
 * direction that costs nothing — a property animation's value (`"0;1;0"`,
 * `"rotate(0,360)"`) carries no scheme — and the direction a bypass would not.
 *
 * @throws when a target is an event handler — the one thing a URL check cannot
 *   judge, `to="alert(1)"` carrying no scheme. Judged on the text it serializes
 *   to, so `raw("onclick")` or `["onclick"]` is the same target as `"onclick"`.
 *   See {@link animatedHandlerMessage}.
 */
function animationWritesUrls(attrs: Record<string, unknown>): boolean {
  let targets = false;
  let writes = false;
  let handler: string | undefined;
  for (const key in attrs) {
    if (!Object.hasOwn(attrs, key)) continue;
    const name = attrMeta(key).name;
    if (ANIMATED_URL_ATTRIBUTES.has(name)) writes = true;
    else if (name.toLowerCase() === "attributename") {
      targets = true;
      const text = targetText(attrs[key]);
      if (text !== undefined && isEventHandlerName(text)) handler = text;
    }
  }
  // Nothing to write is an animation of nothing: it animates no attribute, so
  // there is no URL to have filtered and no handler to have forged. Also the
  // condition `@vincle/precompile` uses to decide whether declining the element
  // would change anything, and the two must agree on it.
  if (!targets || !writes) return false;

  if (handler !== undefined) throw animatedHandlerMessage(handler);
  return true;
}

/** The text an `attributeName` value serializes to, or `undefined` when omitted. */
function targetText(value: unknown): string | undefined {
  if (value === null || value === undefined || typeof value === "boolean") return undefined;
  if (value instanceof RawString || value instanceof RawUrl) return value.value;
  return String(value);
}

/**
 * Why an animation aimed at a handler is refused. One message, so the two paths
 * that can reach it — a rendered element, a precompiled one — cannot disagree
 * on what to say.
 *
 * `attributeName="onclick"` with `to="alert(1)"` puts a handler on an element
 * that never had one, out of a value that reads as data. The value alone cannot
 * be judged: `alert(1)` carries no scheme, so it passes every URL gate, and it
 * is exactly as valid as the `onclick="…"` this runtime deliberately lets
 * through. The difference is provenance, and it is visible in the source: one is
 * code the author typed, the other is indistinguishable from a field of user
 * data by the time it arrives.
 */
function animatedHandlerMessage(target: string): Error {
  return vincleError(
    `[vincle/core] attributeName="${target}" animates an event handler: an animation that writes ` +
      "on* from a value is how data becomes code, and this runtime will not write one. " +
      "Animate a property (`opacity`, `fill`, `transform`) instead, or set the handler as a literal " +
      "attribute, which is the author's code and stays theirs.",
    ERR_ANIMATED_HANDLER,
  );
}

/**
 * Await every promised attribute value, then serialize normally.
 *
 * Resolve into a copy and re-enter `buildAttrs` instead of resuming the loop.
 * This produces the same bytes whether or not an attribute was a promise,
 * because both paths use the serializer above.
 * Sequential awaits, like the child walk in `render.ts`: attribute order is
 * document order.
 */
async function buildAttrsAsync(attrs: Record<string, unknown>, tag: string): Promise<string> {
  const resolved: Record<string, unknown> = {};
  for (const key in attrs) {
    if (!Object.hasOwn(attrs, key)) continue;
    const value = attrs[key];
    resolved[key] = value instanceof Promise ? await value : value;
  }
  // `resolved` holds no promise, so this cannot ask to be awaited again, and
  // `await` says so without a cast having to be believed.
  return await buildAttrs(resolved, tag);
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

// A property *name* carrying `:` or `;` injects declarations: unfiltered,
// `{ "color:red;position": "fixed" }` writes `color:red;position:fixed`.
// No script, but arbitrary CSS (clickjacking) once keys come from data.
const RE_INVALID_STYLE_PROP = /[;:{}<>"'\s]|\p{C}/u;

// A *value* carrying `;` injects them just the same: `{ color: data }` with
// `data = "red;position:fixed"`. Values are repaired rather than dropped:
// `url(data:image/png;base64,…)` is a legitimate value, and CSS reads `\;`
// back as `;`, so escaping changes nothing a browser parses. The backslash is
// escaped by the same pass: otherwise a smuggled `red\;` would survive as a
// live separator. Control characters have no business in a value at all and
// are dropped, like invalid names.
const RE_UNSAFE_STYLE_VALUE = /[\\;\p{Cc}]/u;
const RE_STYLE_VALUE_CONTROLS = /\p{Cc}/u;
const RE_STYLE_VALUE_ESCAPE = /[\\;]/g;

/**
 * A style property name, kebab-cased: with the one vendor prefix `camelToKebab`
 * cannot reach: `ms` is the only one spelled lowercase, so `msFlexAlign` kebabs to
 * `ms-flex-align` and needs the leading hyphen back. Same rule as React's
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
