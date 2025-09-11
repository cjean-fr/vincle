/**
 * @vincle/core — VNode-based JSX-to-HTML renderer.
 *
 * Builds a VNode tree and walks it to produce HTML. Enables deferred
 * rendering, streaming, and tree inspection/transformation.
 *
 * @module
 */

// ── Renderers ─────────────────────────────────────────────────────────────

export { renderToString } from "./src/render.js";

// ── JSX runtime ────────────────────────────────────────────────────────────
//
// `VNode` is exported as a value: the precompile contract (Deno/Preact)
// requires the runtime to *test* for it (`instanceof`) — `jsxEscape` lets a
// VNode pass through untouched, `jsxTemplate` renders it through the tree
// walk. Constructing one by hand stays out of contract: `jsx()` is the only
// way in.

export { Fragment, jsx, jsxs } from "./src/jsx-runtime.js";
export { VNode } from "./src/jsx-runtime.js";

// ── Context API ────────────────────────────────────────────────────────────

export { context, setContext, useContext, withScope, snapshot } from "./src/context.js";
export type { ContextKey, ContextMap } from "./src/context.js";

// ── Trusted HTML ───────────────────────────────────────────────────────────

export { raw } from "./src/types.js";
export type { RawString } from "./src/types.js";

// ── JSX namespace ──────────────────────────────────────────────────────────
//
// Declared once in `src/jsx-namespace.ts` and re-exported by every entry point a
// `jsxImportSource` can name, because that is where the compiler looks it up. The
// export here also satisfies an explicit `import { type JSX } from "@vincle/core"`
// (used by `@vincle/flow`).

export type { JSX } from "./src/jsx-namespace.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type { CSSProperties, ClassValue, FromReact } from "./src/types.js";
export type { Awaitable, Renderable } from "./src/types.js";
