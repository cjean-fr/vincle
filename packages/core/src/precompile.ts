import { RawString, type Awaitable, type JSX } from "./core/types.js";
import { renderAttribute } from "./utils/render-attributes.js";
import { renderChild } from "./utils/render-child.js";

/**
 * Serialize a single dynamic HTML attribute.
 *
 * Emitted by the precompile transform for each non-static attribute. Returns a
 * string like `name="value"` (or `name` for boolean `true`, or `""` when the
 * attribute is skipped). Applies the same security checks as the standard
 * transform: URL scheme blocking, attribute-name validation, event-handler
 * filtering, safe CSS values.
 *
 * `className` is rewritten to `class`. When a value is a Promise (e.g. from
 * an async source), returns `Promise<string>` so `jsxTemplate` can await it.
 *
 * @example
 * jsxAttr("href", "javascript:alert(1)")
 * // => 'href="#blocked"'
 *
 * @example
 * jsxAttr("class", "active")
 * // => 'class="active"'
 */
export function jsxAttr(name: string, value: unknown): Awaitable<string> {
  return renderAttribute(name, value);
}

/**
 * Prepare a dynamic child for embedding into a tagged template.
 *
 * An alias of {@link renderChild}: the precompile escape path and the dynamic
 * render path share one coercion core, so a child is escaped identically whether
 * it reaches the runtime through `jsxTemplate` or through `renderToString`.
 * Returns an escaped string, or a `Promise<string>` for async values —
 * `jsxTemplate` detects the Promise and awaits before concatenation. A nested
 * Promise inside a sub-array surfaces as a Promise here too (the array descent
 * returns one), so it is awaited rather than stringified to "[object Promise]".
 *
 * When `parentTag` is set to a rawtext element (script, style, etc.), string
 * children use {@link escapeRawText} instead of {@link escapeContent}, preventing
 * `</tagName>` breakout without corrupting the content with HTML entities.
 *
 * **Known limitation (precompile mode):** Deno's native precompile transform
 * calls `jsxEscape` with a single argument, so the parent element context is
 * unavailable. Rawtext (script, style) content is entity-escaped, which is
 * XSS-safe but renders `&amp;lt;`/`&amp;gt;` literally in the browser. This
 * matches Preact's behavior — see
 * {@link https://github.com/preactjs/preact-render-to-string/issues/332 | preact-render-to-string#332}.
 * Use `dangerouslySetInnerHTML` for dynamic rawtext content when using
 * precompile mode.
 *
 * @example
 * jsxEscape("<script>alert(1)</script>")
 * // => "&lt;script&gt;alert(1)&lt;/script&gt;"
 *
 * @example
 * jsxEscape(null)
 * // => ""
 */
export const jsxEscape: typeof renderChild = renderChild;

type Interpolation = JSX.Element | Awaitable<string>;

/**
 * Concatenate static template slices with dynamic expressions (each already
 * pre-rendered by `jsxAttr` / `jsxEscape` or by a nested `jsx()` call).
 *
 * Expressions may include Promises (returned by `jsxAttr` for async attribute
 * values, by `jsxEscape` for async children, or by `jsx()` for async
 * components). If any are pending, returns `Promise<RawString>`; otherwise
 * returns a synchronous `RawString`.
 *
 * @example
 * jsxTemplate`<div class="${jsxAttr("class", cls)}">${jsxEscape(child)}</div>`
 * // => RawString('<div class="...">...</div>')
 */
export function jsxTemplate(
  templates: ArrayLike<string>,
  ...values: Interpolation[]
): JSX.Element {
  for (let i = 0; i < values.length; i++) {
    if (values[i] instanceof Promise) {
      return Promise.all(values).then(
        (resolved) =>
          new RawString(
            assemble(templates, resolved as (string | RawString)[]),
          ),
      );
    }
  }
  return new RawString(assemble(templates, values as (string | RawString)[]));
}

/**
 * Concatenate static template slices with their already-coerced slot values.
 *
 * A slot is the output of `jsxAttr` / `jsxEscape` (a string) or of a nested
 * `jsx()` / `jsxTemplate` (a `RawString`); any Promise has already been awaited
 * by `jsxTemplate`. The VincleNode descent — escaping, array flattening, async —
 * lives solely in `renderChild`; this is just the join.
 */
function assemble(
  templates: ArrayLike<string>,
  values: ArrayLike<string | RawString>,
): string {
  let out = templates[0] ?? "";
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    out += typeof v === "string" ? v : v.value;
    out += templates[i + 1] ?? "";
  }
  return out;
}
