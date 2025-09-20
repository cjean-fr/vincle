/**
 * JSX precompile runtime — a gateway to `jsx-runtime`.
 * The `react-jsx-precompile` transform imports this module for the
 * `jsxTemplate`, `jsxAttr`, and `jsxEscape` calls it generates.
 */
export { jsxTemplate, jsxAttr, jsxEscape } from "./jsx-runtime.js";

// Same reason as the other two runtimes: whichever entry point `jsxImportSource`
// names has to carry the namespace.
export type { JSX } from "./jsx-namespace.js";
