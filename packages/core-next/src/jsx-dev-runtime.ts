import { jsx, Fragment, VNode } from "./jsx-runtime.js";

function jsxDEV(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
  _key?: string | null,
  _isStaticChildren?: boolean,
  _source?: { fileName: string; lineNumber: number },
  _self?: unknown,
): VNode {
  return jsx(tag, attributes);
}

export { jsxDEV, jsxDEV as jsx, jsxDEV as jsxs, Fragment, VNode };
