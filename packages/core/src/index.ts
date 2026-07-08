import type { VincleNode } from "./core/types.js";
import { RawString } from "./core/types.js";
import { renderChild } from "./utils/render-child.js";
import { withScope } from "./core/context.js";
import { createBoundarySeed } from "./error-boundary.js";

export { raw } from "./core/types.js";
export { Fragment } from "./jsx-runtime.js";
export { ErrorBoundary } from "./error-boundary.js";
export type {
  RawString,
  CSSProperties,
  StringEventHandlers,
  StaticAttributes,
  HTMLAttributes,
  SVGAttributes,
  VincleNode,
  Component,
  JSX,
} from "./core/types.js";
export {
  context,
  setContext,
  useContext,
  withScope,
  snapshot,
  type ContextKey,
  type ScopeOptions,
} from "./core/context.js";

/**
 * Render a JSX tree to an HTML string.
 *
 * Always returns `Promise<string>` — even when the tree contains no async
 * work — because any component can return a Promise. Output is HTML-safe by
 * default (see the README "Security model" section for what is and isn't
 * defended).
 *
 * Concurrent calls are isolated: `Promise.all([renderToString(a), renderToString(b)])`
 * is safe even when `a` and `b` use `context()` / `setContext()` inside a
 * `withScope()`.
 *
 * @example
 * ```tsx
 * import { renderToString } from "@vincle/core";
 *
 * const Page = async ({ id }: { id: string }) => {
 *   const user = await fetchUser(id);
 *   return <h1>Hello {user.name}</h1>;
 * };
 *
 * const html = await renderToString(<Page id="42" />);
 * ```
 */
export async function renderToString(node: VincleNode): Promise<string> {
  const doRender = () => {
    if (node instanceof RawString) return node.value;
    if (node instanceof Promise)
      return node.then((r) =>
        r instanceof RawString ? r.value : renderChild(r),
      );
    return renderChild(node);
  };

  return withScope(doRender, { seed: createBoundarySeed() });
}
