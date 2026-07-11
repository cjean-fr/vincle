import { RawString } from "./raw.js";
import { escapeContent } from "./escape.js";
import { renderAttr } from "./render-attrs.js";

/**
 * Coerce a raw value to an already-escaped `RawString`, mirroring the dynamic
 * path's `renderChild` so precompiled output stays byte-identical:
 * - null / undefined / boolean → `""`
 * - `RawString` → pass-through (from nested jsxTemplate, jsxEscape, or Vincle)
 * - string → HTML-escaped via `escapeContent`
 * - number → `String(number)`
 * - Array → map + join
 * - sync iterable (Set, Map, generator, …) → materialize + join
 * - async iterable → collect + join (Promise)
 * - Promise → resolve then recurse
 */
export function jsxEscape(
  v: unknown,
): RawString | Promise<RawString> {
  if (v instanceof RawString) return v;
  if (v instanceof Promise) return v.then((resolved) => jsxEscape(resolved));
  if (Array.isArray(v)) return escapeArray(v);
  if (v != null && typeof v !== "string") {
    // Non-string iterables coerce like the dynamic path (renderChild), instead
    // of falling through to `String(v)` → "[object Set]". The string check
    // above keeps the common text case on the fast path.
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

async function collectAsyncIterable(
  iterable: AsyncIterable<unknown>,
): Promise<RawString> {
  let out = "";
  for await (const item of iterable) {
    const r = jsxEscape(item);
    out += (r instanceof Promise ? await r : r).value;
  }
  return new RawString(out);
}

/**
 * Serialize a JSX attribute (name + value) into an HTML attribute string.
 * Returns a `RawString` so `jsxTemplate` won't re-escape it.
 *
 * Uses the same `renderAttr` as the Vincle render pipeline: URL-scheme
 * blocking, CSS safety, name remapping, boolean handling, etc.
 */
export function jsxAttr(
  name: string,
  value: unknown,
): RawString | Promise<RawString> {
  const result = renderAttr(name, value);
  if (result instanceof Promise) return result.then((s) => new RawString(s));
  return new RawString(result);
}

/**
 * Concatenate static template slices with interpolated values.
 *
 * Each value is expected to be a `RawString` (from `jsxEscape` or `jsxAttr`)
 * or a raw value that will be coerced. Nested `jsxTemplate` calls produce
 * `RawString`, so they are safe to nest:
 *
 * @example
 * jsxTemplate`<div>${jsxEscape(content)} ${jsxTemplate`<span>${n}</span>`}</div>`
 */
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

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert any value to its HTML-safe string form. */
function coerce(v: unknown): string {
  if (v == null || v === true || v === false) return "";
  if (typeof v === "string") return escapeContent(v);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => coerce(x)).join("");
  // Sync iterables (Set, Map, generator) — match the dynamic path rather than
  // stringifying to "[object Set]". Async iterables can't be awaited here (a
  // raw template slot is synchronous); they fall through to String(v).
  if (v != null && typeof (v as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function") {
    return coerce(Array.from(v as Iterable<unknown>));
  }
  return escapeContent(String(v));
}

/** Unwrap a template-slot value: RawString → its inner text, otherwise coerce. */
function loose(v: unknown): string {
  if (v instanceof RawString) return v.value;
  return coerce(v);
}

function join(templates: ArrayLike<string>, values: string[]): string {
  let out = templates[0] ?? "";
  for (let i = 0; i < values.length; i++) {
    out += values[i]!;
    out += templates[i + 1] ?? "";
  }
  return out;
}
