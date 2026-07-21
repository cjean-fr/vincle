/**
 * @vincle/core-next — VNode-based JSX-to-HTML renderer.
 *
 * This package is the future of @vincle/core. It uses a VNode intermediate
 * tree (instead of eager string concatenation) to enable deferred rendering,
 * streaming, and a clean seam for template-store → renderer migration.
 *
 * @module
 */

// ── Re-exports ───────────────────────────────────────────────────────────────

import { renderToString as _renderToString } from "./src/create-element.js";
export { _renderToString as renderToString };

/**
 * Alias for {@link renderToString}. Exported for API parity with `@vincle/core`.
 * If you need async rendering, use `renderToString` (sync-only in this version).
 */
export const render = _renderToString;

export { raw, RawString } from "./src/raw.js";
export type { RawString as RawStringType } from "./src/raw.js";
export { VNode, Fragment, jsx, jsxs } from "./src/jsx-runtime.js";
