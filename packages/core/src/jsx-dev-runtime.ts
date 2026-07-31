/**
 * JSX dev runtime — porte vers `jsx-runtime`.
 * Le transform `react-jsxdev` importe ce module en mode développement.
 * Tous les paramètres dev (`_key`, `_isStaticChildren`, `_source`, `_self`)
 * sont ignorés : le comportement est identique à `jsx`.
 */
export { jsx as jsxDEV, Fragment, VNode } from "./jsx-runtime.js";

// TypeScript resolves `JSX.*` from the module named in `jsxImportSource`, which
// under the dev transform is this one.
export type { JSX } from "./jsx-namespace.js";
