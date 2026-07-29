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
export { renderToChunks } from "./src/render-chunks.js";

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
import type { RawString } from "./src/raw.js";
import type { Awaitable, Renderable } from "./src/types.js";

// `RawString` is a first-class renderable leaf (see `renderNode` in
// create-element(-async).ts, which special-cases `instanceof RawString`
// before ever touching `VNode`) — it belongs in `Element`, not behind a cast.
//
// `Element` and `ElementType` answer two different questions, and conflating
// them is what used to force casts in the runtime:
//
//   Element     — what `jsx()` produces. A `VNode`, or a `RawString` when the
//                 static fold succeeded. Stays narrow.
//   ElementType — what may be used as a component. Its return type is
//                 `Renderable`, because the renderers handle far more than
//                 nodes: `() => "text"`, `() => 42`, `() => [<a/>, <b/>]` and
//                 `async () => <div/>` all render correctly, and were all
//                 rejected by tsc while `Element` served as the component
//                 contract. Widening stops there — an object or a symbol return
//                 is still an error.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = Awaitable<VNode | RawString>;
    type ElementType = string | ((props: any) => Renderable);
    type IntrinsicElements = {
      [K in string]: Record<string, unknown> & { children?: unknown };
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export type Element = Awaitable<VNode | RawString>;
  export type ElementType = string | ((props: any) => Renderable);
  export type IntrinsicElements = {
    [K in string]: Record<string, unknown> & { children?: unknown };
  };
}

// ── Types ──────────────────────────────────────────────────────────────────

export type { CSSProperties } from "./src/types-jsx.js";
export type { Awaitable, Renderable } from "./src/types.js";

/** @internal Resolved VNode — same as VNode, used by @vincle/flow types. */
export type ResolvedVNode = VNode;
