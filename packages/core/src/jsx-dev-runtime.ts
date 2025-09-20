/**
 * JSX dev runtime — a gateway to `jsx-runtime`.
 * The `react-jsxdev` transform imports this module in development mode.
 * All the dev-only parameters (`_key`, `_isStaticChildren`, `_source`, `_self`)
 * are ignored: behavior is identical to `jsx`.
 */
export { jsx as jsxDEV, Fragment, VNode } from "./jsx-runtime.js";

// TypeScript resolves `JSX.*` from the module named in `jsxImportSource`, which
// under the dev transform is this one.
export type { JSX } from "./jsx-namespace.js";
