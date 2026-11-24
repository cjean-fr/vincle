/**
 * JSX precompile runtime: a gateway to `jsx-runtime`.
 * The `react-jsx-precompile` transform imports this module for the
 * `jsxTemplate`, `jsxAttr`, and `jsxEscape` calls it generates. Those three are
 * the whole contract, shared with Deno's precompile and Preact: the transform
 * emits nothing a compatible runtime would not export.
 *
 * `jsxTemplateDeferred`, `jsxEscapeDeferred` and `jsxStatic` are the
 * vincle-only additions, emitted only when this module declares the
 * `"vincle"` dialect: a compatible runtime never sees them.
 *
 * **This module is an internal contract surface, public by necessity**: the
 * code a precompile transform emits imports it, so the subpath stays exported,
 * but no application should import it directly. Changes to it are semver-major.
 *
 * Two shapes the helpers return are opaque by design:
 *
 * - `TemplateNode`: markup whose component holes must run at render time. It
 *   implements `Promise<RawString>` so an existing caller can `await` a
 *   template result; everything else about it is private.
 * - `ElementAttr`: an attribute whose answer needs the start tag (SMIL
 *   animations). Deliberately not a `RawString`, so no consumer can emit it as
 *   markup by mistake; only the template holding the tag resolves it.
 *
 * The fallback call the transform emits for elements it declines is
 * `jsx(tag, props, key?)`: the third argument, the JSX `key`, is accepted and
 * ignored. Keys steer client-side reconciliation, and a one-shot string render
 * has nothing to reconcile.
 *
 * **Dialect versioning.** `precompileDialect` is `"vincle"`. Additive helpers
 * are detected by the transform at build time (`jsxStatic` is the example): a
 * runtime that declares the dialect without the new helper keeps the Deno
 * emission for what the helper would have covered, never a missing import, so
 * an addition does not change the value. The value changes, to `"vincle/2"`,
 * only for a breaking change to an existing helper's contract.
 */
export {
  jsxTemplate,
  jsxTemplateDeferred,
  jsxStatic,
  jsxAttr,
  jsxEscape,
  jsxEscapeDeferred,
  precompileDialect,
} from "./jsx-runtime.js";

// Same reason as the other two runtimes: whichever entry point `jsxImportSource`
// names has to carry the namespace.
export type { JSX } from "./jsx-namespace.js";
