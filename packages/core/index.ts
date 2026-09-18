/**
 * @vincle/core — VNode-based JSX-to-HTML renderer.
 *
 * Builds a VNode tree and walks it to produce HTML, which is what lets a render
 * be deferred or streamed. The tree is not a public data structure: `VNode` is a
 * type here, not a constructor, and `jsx()` is the only way to build one.
 *
 * @module
 */

// ── Renderers ─────────────────────────────────────────────────────────────

export { renderToString } from "./src/render.js";

// ── JSX runtime ────────────────────────────────────────────────────────────
//
// `VNode` is exported as a **type only**, the name of what `jsx()` produces —
// for typing a component's return or a generator's yield. The runtime's
// `instanceof` tests are internal, and the precompile contract (Deno/Preact)
// is the three helpers `jsxTemplate` / `jsxAttr` / `jsxEscape`, none of which
// names a VNode. The class is not reachable as a value from here, so `jsx()`
// being the only way in is a fact of the module, not a line of documentation.

export { Fragment, jsx, jsxs } from "./src/jsx-runtime.js";
export type { VNode } from "./src/jsx-runtime.js";

// ── Context API ────────────────────────────────────────────────────────────

export { Scope } from "./src/scope.js";
export type { ScopeKey, ScopeMap } from "./src/scope.js";
export { createContext, useContext } from "./src/provider.js";
/** @internal Used by `@vincle/flow` to retain a Provider across deferred work. */
export { snapshotContext } from "./src/provider.js";
export type { Context } from "./src/provider.js";

// ── Trusted HTML ───────────────────────────────────────────────────────────

export { raw } from "./src/types.js";
export type { RawString } from "./src/types.js";

// ── JSX namespace ──────────────────────────────────────────────────────────
//
// Declared once in `src/jsx-namespace.ts` and re-exported by every entry point a
// `jsxImportSource` can name, because that is where the compiler looks it up. The
// export here also satisfies an explicit `import { type JSX } from "@vincle/core"`
// (used by `@vincle/flow`).

export type { CSSProperties, JSX } from "./src/jsx-namespace.js";

// ── Types ──────────────────────────────────────────────────────────────────

export type { ClassValue } from "./src/types.js";
export type { Awaitable, Renderable } from "./src/types.js";
