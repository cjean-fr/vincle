import type {
  Awaitable,
  CSSProperties,
  HTMLAttributes,
} from "../core/types.js";
import {
  escapeAttr,
  isSafeScheme,
  isSafeSrcset,
  isValidAttrName,
  sanitize,
  URL_ATTRIBUTES,
} from "./escape.js";
import { renderCache } from "./render-cache.js";

const REGEX_CAMEL_TO_KEBAB = /[A-Z]/g;

const INTERNAL_PROPS = new Set<string>([
  "children",
  "dangerouslySetInnerHTML",
  "key",
  "ref",
]);

export function renderStyle(style: CSSProperties): string {
  let out = "";
  for (const key in style) {
    const value = style[key];
    if (value == null) continue;
    const prop = key.startsWith("--")
      ? key
      : key.replace(REGEX_CAMEL_TO_KEBAB, "-$&").toLowerCase();
    const str = String(value);
    if (out.length > 0) out += ";";
    out += `${prop}:${str}`;
  }
  return out;
}

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

/**
 * bitwise event-handler check: first two chars lowercased === "on", third is [a-z].
 * ~3× faster than /^on[a-z]/i on V8.
 */
const isEventHandler = (attrName: string): boolean => {
  const c2 = attrName.charCodeAt(2) | 32;
  return (
    (((attrName.charCodeAt(0) | 32) << 8) | (attrName.charCodeAt(1) | 32)) ===
      28526 &&
    c2 >= 97 &&
    c2 <= 122
  );
};

function computeAttrMeta(
  name: string,
): import("./render-cache.js").AttrMeta | null {
  if (INTERNAL_PROPS.has(name)) return null;

  let attrName = name;
  if (!isValidAttrName(attrName)) {
    attrName = sanitize(attrName);
    if (!isValidAttrName(attrName)) return null;
  }

  const mapped = ATTRIBUTE_NAME_MAP.get(attrName);
  if (mapped !== undefined) {
    attrName = mapped;
  }

  const isEvent = isEventHandler(attrName);
  if (isEvent) attrName = attrName.toLowerCase();

  if (attrName === "style") {
    return { name: attrName, isEvent: false, isStyle: true, urlKind: 0 };
  }

  const lcName = attrName.toLowerCase();
  const urlKind: 0 | 1 | 2 =
    lcName === "srcset" ? 2 : URL_ATTRIBUTES.has(lcName) ? 1 : 0;
  return { name: attrName, isEvent, isStyle: false, urlKind };
}

function getAttrMeta(
  name: string,
): import("./render-cache.js").AttrMeta | null {
  const cached = renderCache.attrMeta.get(name);
  if (cached !== undefined) return cached;
  const meta = computeAttrMeta(name);
  renderCache.attrMeta.set(name, meta);
  return meta;
}

/**
 * Convert a props object into an HTML attribute string.
 *
 * @param props - Attributes object to render; if `null` or `undefined` an empty string is produced
 * @returns The HTML attribute string
 */
export function renderAttributes(
  props: HTMLAttributes | null | undefined,
): Awaitable<string> {
  if (!props) return "";

  let out = "";
  let pending: Promise<string>[] | null = null;

  for (const key in props) {
    if (INTERNAL_PROPS.has(key)) continue;
    const r = renderAttribute(key, props[key]);
    if (typeof r === "string") {
      if (r) out += ` ${r}`;
    } else {
      (pending ??= []).push(r.then((s) => (s ? ` ${s}` : "")));
    }
  }

  return pending
    ? Promise.all(pending).then((parts) => out + parts.join(""))
    : out;
}

/**
 * Render a single HTML attribute into its serialized form (no leading space).
 *
 * Returns `""` if the attribute should be skipped (invalid name, null/false value,
 * unsafe event-handler function, empty/unsafe style). Returns `name` alone for
 * boolean `true`, otherwise `name="escaped value"`. URL attributes with
 * `javascript:` / `vbscript:` schemes are replaced with `#blocked`.
 *
 * Caller is responsible for adding any whitespace separator between attributes.
 * `className` is rewritten to `class`; multiple `class`/`className` props in the
 * same element render as separate attributes (no merge) — this matches Deno's
 * precompile transform where each attribute is rendered in isolation.
 */
export function renderAttributeSync(name: string, value: unknown): string {
  if (value === false || value == null) return "";

  const meta = getAttrMeta(name);
  if (meta === null) return "";
  const attrName = meta.name;

  if (meta.isEvent) {
    if (typeof value === "function") {
      if (!renderCache.warnedEventHandlers.has(name)) {
        renderCache.warnedEventHandlers.add(name);
        console.warn(
          `[vincle/core] Event handler "${name}" was passed a function. ` +
            `This is not supported in static HTML rendering. Use a string instead.`,
        );
      }
      return "";
    }
    if (typeof value !== "string") return "";
  }

  if (meta.isStyle) {
    let style: string;
    if (value !== null && typeof value === "object") {
      style = renderStyle(value as CSSProperties);
    } else {
      style = String(value);
    }
    if (!style) return "";
    return `style="${escapeAttr(style)}"`;
  }

  if (value === true) return attrName;

  let str = typeof value === "string" ? value : String(value);
  if (meta.urlKind === 2) {
    if (!isSafeSrcset(str)) str = "#blocked";
  } else if (meta.urlKind === 1 && !isSafeScheme(str)) {
    str = "#blocked";
  }
  return `${attrName}="${escapeAttr(str)}"`;
}

export function renderAttribute(
  name: string,
  value: unknown,
): Awaitable<string> {
  if (value instanceof Promise) {
    return value.then((v) => renderAttribute(name, v));
  }
  return renderAttributeSync(name, value);
}
