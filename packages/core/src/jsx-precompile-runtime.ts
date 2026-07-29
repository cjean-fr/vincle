/**
 * JSX precompile runtime — porte vers `jsx-runtime`.
 * Le transform `react-jsx-precompile` importe ce module pour les appels
 * `jsxTemplate`, `jsxAttr`, et `jsxEscape` générés par le compilateur.
 */
export { jsxTemplate, jsxAttr, jsxEscape } from "./jsx-runtime.js";
