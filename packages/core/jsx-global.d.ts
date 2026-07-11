// Opt-in ambient augmentation — makes the *bare* global `JSX` namespace resolve
// to Vincle's types, so `const el: JSX.Element = <App />` works without importing
// `JSX` from "@vincle/core".
//
// Enable it explicitly in ONE file of your project (e.g. a `vincle-env.d.ts`):
//
//     /// <reference types="@vincle/core/jsx-global" />
//
// …or via tsconfig `"types": ["@vincle/core/jsx-global", ...]`.
//
// ⚠️  Do NOT enable this in a project that also uses React (or has `@types/react`
// in scope): both declare a global `JSX` namespace and they would merge into an
// unsatisfiable type. React-free projects only. If React coexists, drop this
// file and import `JSX` from "@vincle/core" (or annotate with `VNode`).
//
// This re-uses the module's real `JSX` namespace as the single source of truth,
// so it stays in sync with the runtime — and, unlike an `interface Element`, the
// `type Element` alias below preserves `Awaitable<RawString>` (Promise support).

import type { JSX as VincleJSX } from "@vincle/core";

declare global {
  namespace JSX {
    type Element = VincleJSX.Element;
    interface IntrinsicElements extends VincleJSX.IntrinsicElements {}
    interface IntrinsicAttributes extends VincleJSX.IntrinsicAttributes {}
    interface ElementChildrenAttribute
      extends VincleJSX.ElementChildrenAttribute {}
    interface ElementAttributesProperty
      extends VincleJSX.ElementAttributesProperty {}
  }
}

export {};
