/**
 * JSX dev runtime — porte vers `jsx-runtime`.
 * Le transform `react-jsxdev` importe ce module en mode développement.
 * Tous les paramètres dev (`_key`, `_isStaticChildren`, `_source`, `_self`)
 * sont ignorés : le comportement est identique à `jsx`.
 */
export { jsx as jsxDEV, Fragment, VNode } from "./jsx-runtime.js";
