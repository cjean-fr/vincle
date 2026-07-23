/**
 * Precompile runtime — the helpers a build-time JSX transform emits instead of
 * `jsx()` calls (Deno's `precompile` mode: `jsxTemplate`/`jsxAttr`/`jsxEscape`).
 *
 * These must produce output **byte-identical** to the runtime path so a project
 * can precompile some files and not others. The shared normalization (name
 * resolution, booleans, style objects, class arrays, event handlers, escaping)
 * lives in `attrs.ts` and `escape.ts` and is reused here — no reimplementation.
 *
 * Like the runtime, this does NOT rewrite URL schemes; it only escapes.
 */
import { resolveAttrName, BOOLEAN_ATTRIBUTES, escapeAttr, styleToString, isEventHandler } from "./attrs.js";
import { escapeHtml } from "./escape.js";
import { RawString, raw } from "./raw.js";

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

  // Children, key, ref, dSIH are never rendered as attributes
  if (name === "children" || name === "key" || name === "ref" || name === "dangerouslySetInnerHTML") return raw("");

  // Resolve React name → HTML name (resolveAttrName lowercases by itself)
  const attrName = resolveAttrName(name);

  // Event handlers: function is client-side intent, not serializable → drop.
  // A string is a deliberate inline handler → emit it escaped.
  if (isEventHandler(attrName)) {
    if (typeof value !== "string") return raw("");
    return new RawString(` ${attrName}="${escapeAttr(value)}"`);
  }

  // Any other function value is a programmer error.
  if (typeof value === "function") {
    throw new Error(
      `[vincle/core] Attribute "${name}" received a function as value. ` +
        "Functions are not serializable to HTML.",
    );
  }

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

  return new RawString(` ${attrName}="${escapeAttr(String(value))}"`);
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
