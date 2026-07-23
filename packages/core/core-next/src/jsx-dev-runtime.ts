// Dev JSX runtime entry (`jsxImportSource` + `jsx: "react-jsxdev"`). vincle
// carries no dev-only behavior, so this simply re-exports the runtime's
// `jsxDEV` (which ignores the extra source/self args) under the jsx/jsxs names.
export { jsxDEV, jsxDEV as jsx, jsxDEV as jsxs, Fragment, VNode } from "./jsx-runtime.js";
export { jsxAttr, jsxEscape, jsxTemplate } from "./jsx-precompile-runtime.js";
