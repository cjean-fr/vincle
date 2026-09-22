/**
 * React 19 context type contract — checked by `bun run check`, not by `bun test`.
 *
 * No runtime assertion: the file *is* the assertion. If it compiles, a modern
 * React context object remains assignable to the vincle context type — the
 * direction of interoperability this package exists for — and the JSX surface
 * accepts the three React 19 forms. The `@ts-expect-error` line locks in the
 * one direction deliberately not claimed, so a widening there fails the build.
 *
 * @module
 */
import type { Context as VincleContext } from "@vincle/core";
import type { Context as ReactContext } from "react";

import { createContext } from "@vincle/core";

type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Expect<T extends true> = T;

// A React context is usable where a vincle context is expected:
// `useContext(reactContext)` type-checks.
type ReactIsVincle = IsAssignable<ReactContext<number>, VincleContext<number>>;
export type _reactContextIsVincleCompatible = Expect<ReactIsVincle>;

// The reverse is not claimed: a vincle context does not carry `$$typeof`, and
// masquerading as a React context would be a lie React's reconciler would not
// honour. If this ever starts compiling, the directive below fails the build.
type VincleIsReact = IsAssignable<VincleContext<number>, ReactContext<number>>;
// @ts-expect-error `false` does not satisfy the `true` constraint
export type _vincleContextIsNotAReactContext = Expect<VincleIsReact>;

// The React 19 JSX surface: the context as provider, the `.Provider` alias,
// and the `.Consumer` render-prop.
const C = createContext("x");
export const forms = [
  <C value="y">direct</C>,
  <C.Provider value="y">alias</C.Provider>,
  <C.Consumer>{(v: string) => v}</C.Consumer>,
];
