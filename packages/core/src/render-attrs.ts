import type { Awaitable } from "./render.js";

import {
  escapeAttr,
  isValidAttrName,
  sanitize,
  isSafeScheme,
  isSafeSrcset,
  URL_ATTRIBUTES,
  ATTRIBUTE_NAME_MAP,
  BOOLEAN_ATTRIBUTES,
} from "./escape.js";
import { RawString } from "./raw.js";

// ── Style rendering ──────────────────────────────────────────────────────

const MAX_CSS_CACHE = 1000;
const CSS_PROP_CACHE = new Map<string, string>();
const REGEX_CAMEL_TO_KEBAB = /[A-Z]/g;

function cssPropName(key: string): string {
  if (key.startsWith("--")) return key;
  let cached = CSS_PROP_CACHE.get(key);
  if (cached === undefined) {
    cached = key.replace(REGEX_CAMEL_TO_KEBAB, "-$&").toLowerCase();
    if (CSS_PROP_CACHE.size >= MAX_CSS_CACHE) CSS_PROP_CACHE.clear();
    CSS_PROP_CACHE.set(key, cached);
  }
  return cached;
}

function renderStyle(style: Record<string, string | number | undefined>): string {
  let out = "";
  for (const key in style) {
    const value = style[key];
    if (value == null) continue;
    const prop = cssPropName(key);
    if (out) out += ";";
    out += `${prop}:${String(value)}`;
  }
  return out;
}

// ── Event handler detection ──────────────────────────────────────────────

const ON_MASK = ("o".charCodeAt(0) << 8) | "n".charCodeAt(0);

function isEventHandler(name: string): boolean {
  const c2 = name.charCodeAt(2) | 32;
  return (
    (((name.charCodeAt(0) | 32) << 8) | (name.charCodeAt(1) | 32)) === ON_MASK &&
    c2 >= 97 &&
    c2 <= 122
  );
}

const warnedEventHandlers = new Set<string>();

// ── Attribute meta cache ─────────────────────────────────────────────────

const URL_NONE = 0;
const URL_ATTR = 1;
const URL_SRCSET = 2;

interface AttrMeta {
  name: string;
  isEvent: boolean;
  isStyle: boolean;
  isBoolean: boolean;
  urlKind: 0 | 1 | 2;
}

const MAX_ATTR_CACHE = 1000;
const ATTR_META_CACHE = new Map<string, AttrMeta | null>();

function computeAttrMeta(name: string): AttrMeta | null {
  if (name === "children" || name === "dangerouslySetInnerHTML" || name === "key" || name === "ref")
    return null;

  let attrName = name;
  if (!isValidAttrName(attrName)) {
    attrName = sanitize(attrName);
    if (!isValidAttrName(attrName)) return null;
  }

  const mapped = ATTRIBUTE_NAME_MAP.get(attrName);
  if (mapped !== undefined) attrName = mapped;

  const isEvent = isEventHandler(attrName);
  if (isEvent) attrName = attrName.toLowerCase();

  if (attrName === "style") {
    return { name: attrName, isEvent: false, isStyle: true, isBoolean: false, urlKind: 0 };
  }

  const lcName = attrName.toLowerCase();
  const urlKind: 0 | 1 | 2 =
    lcName === "srcset" ? URL_SRCSET : URL_ATTRIBUTES.has(lcName) ? URL_ATTR : URL_NONE;
  return { name: attrName, isEvent, isStyle: false, isBoolean: BOOLEAN_ATTRIBUTES.has(lcName), urlKind };
}

function getAttrMeta(name: string): AttrMeta | null {
  const cached = ATTR_META_CACHE.get(name);
  if (cached !== undefined) return cached;
  const meta = computeAttrMeta(name);
  if (ATTR_META_CACHE.size >= MAX_ATTR_CACHE) ATTR_META_CACHE.clear();
  ATTR_META_CACHE.set(name, meta);
  return meta;
}

// ── Single attribute rendering ──────────────────────────────────────────

export function renderAttr(name: string, value: unknown): Awaitable<string> {
  if (value instanceof Promise) {
    return value.then((v) => renderAttr(name, v));
  }

  if (value == null) return "";

  const meta = getAttrMeta(name);
  if (meta === null) return "";
  const attrName = meta.name;

  if (value instanceof RawString) {
    return meta.isEvent ? "" : `${attrName}="${value.value}"`;
  }

  if (meta.isEvent) {
    if (typeof value === "function") {
      if (!warnedEventHandlers.has(name)) {
        warnedEventHandlers.add(name);
        console.warn(
          `[vincle/core] Event handler "${name}" was passed a function. ` +
            "This is not supported in static HTML rendering. Use a string instead.",
        );
      }
      return "";
    }
    if (typeof value !== "string") return "";
  }

  if (meta.isStyle) {
    let style: string;
    if (value !== null && typeof value === "object") {
      style = renderStyle(value as Record<string, string | number | undefined>);
    } else {
      style = String(value);
    }
    if (!style) return "";
    return `style="${escapeAttr(style)}"`;
  }

  // HTML boolean attribute: presence = true, absence = false
  if (meta.isBoolean) {
    if (value === false) return "";
    if (value === true) return attrName;
    // Non-boolean value for a boolean attr is a programming error; drop it
    return "";
  }

  let str = typeof value === "string" ? value : String(value);
  if (meta.urlKind === URL_SRCSET) {
    if (!isSafeSrcset(str)) str = "#blocked";
  } else if (meta.urlKind === URL_ATTR && !isSafeScheme(str)) {
    str = "#blocked";
  }

  return `${attrName}="${escapeAttr(str)}"`;
}

// ── Props rendering ──────────────────────────────────────────────────────
//
// When a React-style name (e.g. `className`, `htmlFor`) and its HTML-native
// counterpart (`class`, `for`) both appear in props, the HTML name wins and the
// React name is silently dropped — no merge, single pass. This rule applies
// uniformly to all entries in `ATTRIBUTE_NAME_MAP`. The rationale: vincle
// renders HTML, not React, so the HTML-native form is the canonical output.

export function renderAttrs(props: Record<string, unknown> | null | undefined): Awaitable<string> {
  if (!props) return "";
  let out = "";
  let pending: Promise<string>[] | null = null;

  for (const key in props) {
    if (key === "children" || key === "dangerouslySetInnerHTML" || key === "key" || key === "ref") continue;
    const meta = getAttrMeta(key);
    if (meta === null) continue;
    // When both a React-style name (className) and its HTML-native counterpart
    // (class) are in props, the HTML name wins and the React name is skipped.
    if (meta.name !== key && meta.name in props) continue;
    const r = renderAttr(key, props[key]);
    if (typeof r === "string") {
      if (r) out += ` ${r}`;
    } else {
      (pending ??= []).push(r.then((s) => (s ? ` ${s}` : "")));
    }
  }

  return pending ? Promise.all(pending).then((parts) => out + parts.join("")) : out;
}
