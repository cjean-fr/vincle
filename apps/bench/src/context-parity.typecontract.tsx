/**
 * React 19 context type contract - checked by `bun run check`, not by `bun test`.
 *
 * Vincle and React contexts stay distinct even though their JSX surfaces match:
 * vincle cannot render a React context or read its default. The JSX surface
 * accepts the three React 19 forms for contexts created by vincle.
 *
 * @module
 */
import type { Context as VincleContext } from "@vincle/core";
import type { Context as ReactContext } from "react";

import { createContext } from "@vincle/core";

type IsAssignable<From, To> = [From] extends [To] ? true : false;
type Expect<T extends true> = T;

// React contexts have the same visible surface but a different runtime protocol.
type ReactIsVincle = IsAssignable<ReactContext<number>, VincleContext<number>>;
// @ts-expect-error `false` does not satisfy the `true` constraint
export type _reactContextIsNotVincleCompatible = Expect<ReactIsVincle>;

// The reverse is also invalid: a vincle context does not carry `$$typeof`.
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
