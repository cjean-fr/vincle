import type { VNode } from "./render.js";
import {
  render,
  renderAttr,
  renderChild,
  renderElement,
  renderComponent,
  finalizeNode,
} from "./render.js";
import { RawString } from "./raw.js";

export type {
  CSSProperties,
  StringEventHandlers,
  StaticAttributes,
  HTMLAttributes,
  SVGAttributes,
} from "./types-jsx.js";

export namespace JSX {
  export type Element = VNode;
  export type ElementType = string | ((props: any) => VNode);
  export interface IntrinsicElements {
    [tag: string]: import("./types-jsx.js").HTMLAttributes;
  }
  export interface IntrinsicAttributes {
    key?: string | number | null | undefined;
    [key: string]: any;
  }
  export interface ElementAttributesProperty {
    props: {};
  }
  export interface ElementChildrenAttribute {
    children: {};
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
      ) as unknown as VNode;
    }
    return renderComponent(
      type as (props: Record<string, unknown>) => VNode,
      (props ?? {}) as Record<string, unknown>,
    ) as unknown as VNode;
  }
  return renderElement(
    type,
    (props ?? {}) as Record<string, unknown>,
  ) as unknown as VNode;
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

export function jsxAttr(
  name: string,
  value: unknown,
): RawString | Promise<RawString> {
  const result = renderAttr(name, value);
  if (result instanceof Promise) return result.then((s) => new RawString(s));
  return new RawString(result);
}

export function jsxTemplate(
  templates: ArrayLike<string>,
  ...values: VNode[]
): RawString | Promise<RawString> {
  const resolved = values.map((v) => render(v));
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i] instanceof Promise) {
      return Promise.all(resolved).then(
        (r) => new RawString(assemble(templates, r)),
      );
    }
  }
  return new RawString(assemble(templates, resolved as string[]));
}

function assemble(
  templates: ArrayLike<string>,
  values: ArrayLike<string>,
): string {
  let out = templates[0] ?? "";
  const n = values.length;
  for (let i = 0; i < n; i++) {
    out += values[i]!;
    out += templates[i + 1] ?? "";
  }
  return out;
}
