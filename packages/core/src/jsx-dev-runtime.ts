import type { Component, JSX } from "./core/types.js";
import { jsx } from "./jsx-runtime.js";

export {
  jsxs,
  Fragment,
  jsxAttr,
  jsxEscape,
  jsxTemplate,
} from "./jsx-runtime.js";
export type { JSX };

export function jsxDEV<P extends {} = {}>(
  type: string | Component<P>,
  props: P,
  _key?: unknown,
  _isStaticChildren?: boolean,
  _source?: { fileName?: string; lineNumber?: number; columnNumber?: number },
  _self?: unknown,
): JSX.Element {
  return jsx(type, props);
}
