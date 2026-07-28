/**
 * @vincle/core — VNode-based JSX-to-HTML renderer.
 *
 * Builds a VNode tree and walks it to produce HTML. Enables deferred
 * rendering, streaming, and tree inspection/transformation.
 *
 * @module
 */

// ── Renderers ─────────────────────────────────────────────────────────────

export { renderToString } from "./src/create-element-async.js";

// ── JSX runtime ────────────────────────────────────────────────────────────

export { VNode, Fragment, jsx, jsxs } from "./src/jsx-runtime.js";

// ── Context API ────────────────────────────────────────────────────────────

export {
  context,
  setContext,
  useContext,
  withScope,
  snapshot,
  resetContextStorage,
} from "./src/context.js";
export type { ContextKey, ContextMap } from "./src/context.js";

// ── Trusted HTML ───────────────────────────────────────────────────────────

export { raw, RawString } from "./src/raw.js";
export type { RawString as RawStringType } from "./src/raw.js";

// ── JSX namespace for react-jsx transform ──────────────────────────────────
//
// TypeScript looks for `JSX.IntrinsicElements` globally when processing JSX.
// The `declare global` block below makes it available to any package that
// imports `@vincle/core`.
//
// The `export` of the same namespace satisfies explicit imports like
// `import { type JSX } from "@vincle/core"` (used by @vincle/flow).

import type { VNode } from "./src/jsx-runtime.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = VNode | Promise<VNode>;
    type IntrinsicElements = {
      [K in string]: Record<string, unknown> & { children?: unknown };
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export type Element = VNode | Promise<VNode>;
  export type IntrinsicElements = {
    [K in string]: Record<string, unknown> & { children?: unknown };
  };
}

// ── Types ──────────────────────────────────────────────────────────────────

export type { CSSProperties } from "./src/types-jsx.js";

/** @internal Resolved VNode — same as VNode, used by @vincle/flow types. */
export type ResolvedVNode = VNode;
