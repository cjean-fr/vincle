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
   *
   * `Awaitable<Renderable>`, not `Renderable`, for the one shape the flat type
   * cannot express: `JSX.Element` is itself awaitable, so an async component that
   * *writes its return type down* — `async (): Promise<JSX.Element>`, the
   * annotation anyone arriving from React reaches for — is a promise of a
   * promise. Inference collapsed it, so it compiled only as long as nobody
   * annotated. Making `Renderable` itself recursive is the other way to say this,
   * and TypeScript refuses it: a type reached through its own `then` callback is
   * TS1062. The extra level belongs on the boundary, where the walk resolves it.
   */
  export type ElementType = string | ((props: any) => Awaitable<Renderable>);

  /**
   * Real attribute types per element, plus an open door for custom elements.
   *
   * Per element rather than `Record<string, unknown>` for all of them, so
   * `<dvi clas="x" onCilck={f}/>` is an error and not an element that accepts
   * anything. The tables come from React, which is also what lets an
   * augmentation of `React.JSX.IntrinsicElements` — `@vincle/flow` declares one
   * — flow through here.
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
