import type { VNode } from "./render.js";
import {
  renderChild,
  renderElement,
  renderComponent,
  finalizeNode,
} from "./render.js";

export type {
  CSSProperties,
  StringEventHandlers,
  StaticAttributes,
  HTMLAttributes,
  SVGAttributes,
} from "./types-jsx.js";

import type React from "react";

// Local copy of the mapped type so the `interface` below keeps its `extends`
// clause through pkgroll's .d.ts bundling (cross-module `import()` types in an
// `extends` get dropped by rollup-plugin-dts).
//
// Each element's props are `FromReact<…>` (React's props, camelCase event
// handlers turned into strings, React-only props stripped) intersected with a
// permissive string-index signature: vincle renders raw HTML, so consumers
// write real HTML attribute names (`charset`, `tabindex`, `crossorigin`,
// `aria-*`, `data-*`, custom attributes, …) which are not valid React prop
// names. The index signature keeps the React-derived prop types for known
// attributes while accepting any other HTML attribute.
type MappedIntrinsicElements = {
  [Tag in keyof React.JSX.IntrinsicElements]: import("./types-jsx.js").FromReact<
    React.JSX.IntrinsicElements[Tag]
  > & {
    [attr: string]: unknown;
  };
};

export namespace JSX {
  export type Element = VNode;
  export type ElementType = string | ((props: any) => VNode);
  /** Per-element attribute types, derived from @types/react. Every element gets
   * its own specific attributes (e.g. `<input>` has `checked`, `value`, `type`).
   * Augment `React.JSX.IntrinsicElements` to register custom elements.
   *
   * Declared as an `interface` (not a `type` alias) because TypeScript's JSX
   * element checker only recognizes intrinsic elements when `IntrinsicElements`
   * is an interface — `type` aliases are ignored there, and an interface is also
   * what lets consumers augment custom elements. */
  export interface IntrinsicElements extends MappedIntrinsicElements {}
  export interface IntrinsicAttributes {
    key?: string | number | null | undefined;
  }
}

/**
 * JSX Fragment — groups children without a wrapper element. `jsx` detects this
 * reference and renders its children directly (without component annotation).
 */
export function Fragment({ children }: { children?: VNode }): VNode {
  return children;
}

/**
 * Automatic JSX runtime entry. Renders eagerly: an intrinsic element or
 * component is turned into its HTML string (wrapped in a `RawString`) right
 * here, so the returned value can be dropped into a parent's children without
 * re-escaping.
 */
export function jsx<P extends {} = {}>(
  type: string | ((props: P) => VNode),
  props: P,
  _key?: unknown,
): VNode {
  if (typeof type === "function") {
    if (type === Fragment) {
      return finalizeNode(
        renderChild((props as { children?: unknown } | null)?.children),
      );
    }
    return renderComponent(
      type as (props: Record<string, unknown>) => VNode,
      (props ?? {}) as Record<string, unknown>,
    );
  }
  return renderElement(
    type,
    (props ?? {}) as Record<string, unknown>,
  );
}

export const jsxs: typeof jsx = jsx;

export function jsxDEV<P extends {} = {}>(
  type: string | ((props: P) => VNode),
  props: P,
  _key?: unknown,
  _isStaticChildren?: boolean,
  _source?: {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  },
  _self?: unknown,
): VNode {
  return jsx(type, props);
}

/**
 * Classic-runtime element factory (the `React.createElement` shape). vincle's
 * JSX uses the automatic runtime (`jsx`/`jsxs`), but TypeScript silently falls
 * back to `createElement` — imported from the `jsxImportSource` root, i.e. this
 * module — for a `key` placed after a spread (`<div {...p} key={k} />`).
 * Exporting it means that (otherwise valid) pattern compiles and renders
 * instead of crashing on a missing import.
 *
 * Trailing `children` args are folded into `props.children`; `key`/`ref` are
 * stripped, so a component never observes them — matching what the automatic
 * runtime does, where `key` arrives as a separate argument `jsx` ignores.
 */
export function createElement(
  type: string | ((props: any) => VNode),
  props?: Record<string, unknown> | null,
  ...children: unknown[]
): VNode {
  const merged: Record<string, unknown> = props ? { ...props } : {};
  delete merged["key"];
  delete merged["ref"];
  if (children.length === 1) merged["children"] = children[0];
  else if (children.length > 1) merged["children"] = children;
  return jsx(type, merged);
}

export {
  jsxAttr,
  jsxEscape,
  jsxTemplate,
} from "./jsx-precompile-runtime.js";
