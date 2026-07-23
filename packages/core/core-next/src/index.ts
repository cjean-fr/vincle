/**
 * @vincle/core — VNode-based JSX-to-HTML string renderer. Zero dependencies.
 *
 * Two renderers over one VNode tree:
 *  - {@link renderToString} — synchronous, monomorphic, the fast path.
 *  - {@link renderToStringAsync} — for async components / Promise children.
 *
 * Security model: values are HTML-escaped so they cannot break out of their
 * context. vincle does **not** rewrite URL schemes (`javascript:`, `data:`, …)
 * — that policy belongs to the app (CSP + sanitizing untrusted URLs).
 *
 * Streaming, deferred fragments and islands live in `@vincle/flow`, which
 * builds its own renderer on this package's VNode tree.
 *
 * @module
 */

export { renderToString } from "./create-element.js";
export { renderToStringAsync } from "./create-element-async.js";

export { raw, RawString } from "./raw.js";
export { Fragment, VNode } from "./jsx-runtime.js";
export type { Renderable, ResolvedVNode, Component, JSX } from "./jsx-runtime.js";

export {
  context,
  setContext,
  useContext,
  withScope,
  snapshot,
  resetContextStorage,
} from "./context.js";
export type { ContextKey, ContextMap } from "./context.js";

export type { CSSProperties } from "./types-jsx.js";
