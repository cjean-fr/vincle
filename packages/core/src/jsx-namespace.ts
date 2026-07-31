/**
 * The `JSX` namespace TypeScript reads when it type-checks JSX syntax.
 *
 * It lives here, once, because it has to be *exported by the module named in
 * `jsxImportSource`* — that module is where the compiler looks, and a global
 * `declare global { namespace JSX }` is only a fallback it does not always
 * consult. So `jsx-runtime`, `jsx-dev-runtime` and the package root each
 * re-export this one declaration rather than restating it; four copies of five
 * type aliases is four chances to disagree about what a `<div>` accepts.
 *
 * @module
 */

import type { VNode } from "./jsx-runtime.js";
import type {
  Awaitable,
  CustomElements,
  IntrinsicElementsFromReact,
  RawString,
  Renderable,
} from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  /**
   * What `jsx()` produces: a `VNode`, a `RawString` when the static fold
   * succeeded, or a promise of one when an attribute value was itself a promise.
   *
   * `RawString` is a first-class renderable leaf — `renderNode` special-cases
   * `instanceof RawString` before it ever looks at `VNode` — so it belongs here
   * rather than behind a cast at each call site.
   */
  export type Element = Awaitable<VNode | RawString>;

  /**
   * What may be used as a component.
   *
   * The return type is `Renderable`, not `Element`: the renderers handle far more
   * than nodes. `() => "text"`, `() => 42`, `() => [<a/>, <b/>]` and
   * `async () => <div/>` all render correctly, and every one of them was rejected
   * by tsc while `Element` served as the component contract. Widening stops there
   * — an object or a symbol return is still an error.
   */
  export type ElementType = string | ((props: any) => Renderable);

  /**
   * Real attribute types per element, plus an open door for custom elements.
   *
   * This used to be `{ [K in string]: Record<string, unknown> }` — every element
   * accepting every attribute, so `<dvi clas="x" onCilck={f}/>` compiled. The
   * machinery to do it properly already sat unused in `types.ts`, and
   * `@vincle/flow` was already augmenting `React.JSX.IntrinsicElements` expecting
   * it to flow through here. It does now.
   */
  export type IntrinsicElements = IntrinsicElementsFromReact & CustomElements;

  /**
   * Props every element accepts without them being attributes.
   *
   * `key` is lifted out of props by the JSX transform, so it never reaches the
   * runtime and must not be checked against an element's attribute list.
   */
  export interface IntrinsicAttributes {
    key?: string | number | bigint | null | undefined;
  }

  /**
   * Names the prop that JSX children are written into, so `<div>{value}</div>` is
   * checked against `children` instead of not being checked at all. Only the
   * property *name* is read by the compiler; its type is irrelevant.
   */
  export interface ElementChildrenAttribute {
    children: unknown;
  }
}
