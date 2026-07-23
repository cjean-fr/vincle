import { escapeAttr } from "./escape.js";
import {
  resolveAttrName,
  BOOLEAN_ATTRIBUTES,
  styleToString,
} from "./attrs.js";
import { escapeHtml } from "./create-element.js";
import { RawString, raw } from "./raw.js";
import { isSafeScheme } from "./url-safety.js";

export function jsxEscape(v: unknown): RawString | Promise<RawString> {
  if (v instanceof RawString) return v;
  if (v instanceof Promise) return v.then((resolved) => jsxEscape(resolved));
  if (Array.isArray(v)) return escapeArray(v);
  if (v != null && typeof v !== "string") {
    const anyV = v as { [Symbol.iterator]?: unknown; [Symbol.asyncIterator]?: unknown };
    if (typeof anyV[Symbol.iterator] === "function") {
      return escapeArray(Array.from(v as Iterable<unknown>));
    }
    if (typeof anyV[Symbol.asyncIterator] === "function") {
      return collectAsyncIterable(v as AsyncIterable<unknown>);
    }
  }
  return new RawString(coerce(v));
}

function escapeArray(arr: unknown[]): RawString | Promise<RawString> {
  const parts = arr.map(jsxEscape);
  if (parts.some((p) => p instanceof Promise)) {
    return Promise.all(parts).then((resolved) => {
      let out = "";
      for (const s of resolved) out += s.value;
      return new RawString(out);
    });
  }
  let out = "";
  for (const s of parts as RawString[]) out += s.value;
  return new RawString(out);
}

async function collectAsyncIterable(iterable: AsyncIterable<unknown>): Promise<RawString> {
  let out = "";
  for await (const item of iterable) {
    const r = jsxEscape(item);
    out += (r instanceof Promise ? await r : r).value;
  }
  return new RawString(out);
}

export function jsxAttr(name: string, value: unknown): RawString | Promise<RawString> {
  if (value instanceof Promise) {
    return value.then((v) => jsxAttr(name, v));
  }

  if (value == null) return raw("");

  // Children, key, ref are never rendered as attributes
  if (name === "children" || name === "key" || name === "ref" || name === "dangerouslySetInnerHTML") return raw("");

  if (typeof value === "function") {
    if (isEventHandler(name)) {
      console.warn(
        `[vincle/core] Event handler "${name}" was passed a function. ` +
          "This is not supported in static HTML rendering. Use a string instead.",
      );
      return raw("");
    }
    throw new Error(
      `[vincle/core] Attribute "${name}" received a function as value. ` +
        "Functions are not serializable to HTML.",
    );
  }

  // Resolve React name → HTML name (resolveAttrName lowercases by itself)
  const attrName = resolveAttrName(name);

  if (value instanceof RawString) {
    return new RawString(` ${attrName}="${value.value}"`);
  }

  // Style object → string
  if (attrName === "style" && typeof value === "object" && !Array.isArray(value)) {
    const styleStr = styleToString(value as Record<string, string | number | null | undefined>);
    if (!styleStr) return raw("");
    return new RawString(` style="${escapeAttr(styleStr)}"`);
  }

  // Class array → string
  if (attrName === "class" && Array.isArray(value)) {
    let s = "";
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item && typeof item === "string") {
        if (s) s += " ";
        s += item;
      }
    }
    if (!s) return raw("");
    return new RawString(` class="${escapeAttr(s)}"`);
  }

  // Boolean attribute
  if (typeof value === "boolean") {
    if (BOOLEAN_ATTRIBUTES.has(attrName)) {
      return value ? raw(` ${attrName}`) : raw("");
    }
    return new RawString(` ${attrName}="${value}"`);
  }

  // Event handlers — warn and drop
  if (isEventHandler(attrName)) {
    if (typeof value !== "string") return raw("");
    console.warn(
      `[vincle/core] Event handler "${name}" was passed as a string value. ` +
        "Event handlers are not rendered in static HTML.",
    );
    return raw(` ${attrName}="${escapeAttr(value)}"`);
  }

  let str = String(value);
  switch (attrName) {
    case "href":
    case "src":
    case "action":
    case "formaction":
    case "xlink:href":
      if (!isSafeScheme(str)) str = "#blocked";
      break;
  }

  return new RawString(` ${attrName}="${escapeAttr(str)}"`);
}

const ON_MASK = ("o".charCodeAt(0) << 8) | "n".charCodeAt(0);

function isEventHandler(name: string): boolean {
  const c2 = name.charCodeAt(2) | 32;
  return (
    (((name.charCodeAt(0) | 32) << 8) | (name.charCodeAt(1) | 32)) === ON_MASK &&
    c2 >= 97 && c2 <= 122
  );
}

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

function coerce(v: unknown): string {
  if (v == null || v === true || v === false) return "";
  if (typeof v === "string") return escapeHtml(v);
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (Array.isArray(v)) return v.map((x) => coerce(x)).join("");
  if (v != null && typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function") {
    return coerce(Array.from(v as Iterable<unknown>));
  }
  return escapeHtml(String(v));
}

function join(templates: ArrayLike<string>, values: string[]): string {
  let out = templates[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    out += values[i]!;
    out += templates[i + 1] ?? "";
  }
  return out;
}

export function jsxTemplate(
  templates: ArrayLike<string>,
  ...values: unknown[]
): RawString | Promise<RawString> {
  for (const v of values) {
    if (v instanceof Promise) {
      return Promise.all(values).then((resolved) => {
        const parts = resolved.map(loose);
        return new RawString(join(templates, parts));
      });
    }
  }
  return new RawString(join(templates, values.map(loose)));
}

function loose(v: unknown): string {
  if (v instanceof RawString) return v.value;
  return coerce(v);
}
