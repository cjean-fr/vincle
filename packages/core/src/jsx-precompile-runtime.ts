/**
 * JSX precompile runtime — porte vers `jsx-runtime`.
 * Le transform `react-jsx-precompile` importe ce module pour les appels
 * `jsxTemplate`, `jsxAttr`, et `jsxEscape` générés par le compilateur.
 */
export { jsxTemplate, jsxAttr, jsxEscape } from "./jsx-runtime.js";

// Same reason as the other two runtimes: whichever entry point `jsxImportSource`
// names has to carry the namespace.
export type { JSX } from "./jsx-namespace.js";
