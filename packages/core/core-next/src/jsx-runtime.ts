import { raw, RawString } from "./raw.js";
import { tryRenderStatic, NOT_STATIC } from "./static-render.js";
import type { IntrinsicElements as CoreIntrinsicElements } from "./types-jsx.js";

// ── VNode ─────────────────────────────────────────────────────────────────
//
// An element node in the tree: a validated tag (or component function), its
// props, and its children. Kept as a fixed-shape class (fields set once, in
// constructor order) so JSC/V8 give every instance the same hidden class —
// monomorphic `instanceof` and property access on the render hot path.

class VNode {
  readonly tag: string | ((props: any) => any);
  readonly attrs: Record<string, unknown>;
  readonly children: unknown;

  constructor(
    tag: string | ((props: any) => any),
    attrs: Record<string, unknown>,
    children: unknown,
  ) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = children;
  }
}

// ── Renderable value taxonomy ──────────────────────────────────────────────

/** Everything the renderer accepts as a child or as a component's return value. */
export type Renderable =
  | VNode
  | RawString
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | Renderable[]
  | Iterable<Renderable>
  | Promise<Renderable>
  | AsyncIterable<Renderable>;

/** {@link Renderable} with the recursive `Promise` removed — a cast target in
 * thenable-sensitive contexts (`yield <li/> as ResolvedVNode`) to sidestep
 * TS1062 ("type referenced in its own `then` callback"). */
export type ResolvedVNode = Exclude<Renderable, Promise<Renderable>>;

/** A component: a function from props to something renderable. Async components
 * (`Promise<VNode>` return) are supported by `renderToStringAsync`. */
export type Component<P = {}> = (props: P) => Renderable;

// ── jsx — hybrid: single-pass fold of static trees, VNode for dynamic ───────
//
// A string-tag element is folded to a RawString in one traversal by
// `tryRenderStatic`; it returns NOT_STATIC the moment it hits a dynamic node
// (component, VNode child, Promise, function, or an unfoldable prop), and we
// fall through to a VNode for the tree-walk renderer.

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode {
  const props = attributes ?? {};

  if (typeof tag === "string") {
    const folded = tryRenderStatic(tag, props);
    if (folded !== NOT_STATIC) return folded as unknown as VNode;
  }

  // Dynamic path: create VNode for tree-walk rendering
  const p = props as { children?: unknown; dangerouslySetInnerHTML?: { __html?: unknown } };
  const finalChildren =
    p.dangerouslySetInnerHTML !== undefined
      ? raw(String(p.dangerouslySetInnerHTML.__html ?? ""))
      : p.children;
  return new VNode(tag, props, finalChildren);
}

const jsxs = jsx;

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

/**
 * JSX Fragment — groups children without a wrapper element.
 */
function Fragment({ children }: { children?: unknown }): unknown {
  return children;
}

/**
 * Classic-runtime element factory (the `React.createElement` shape). vincle's
 * JSX uses the automatic runtime (`jsx`/`jsxs`), but TypeScript silently falls
 * back to `createElement` for a `key` after a spread (`<div {...p} key={k} />`).
 * Exporting it keeps that (valid) pattern compiling. `key`/`ref` are stripped;
 * trailing `children` args fold into `props.children`.
 */
function createElement(
  tag: string | ((props: any) => any),
  props?: Record<string, unknown> | null,
  ...children: unknown[]
): VNode {
  const merged: Record<string, unknown> = props ? { ...props } : {};
  delete merged["key"];
  delete merged["ref"];
  if (children.length === 1) merged["children"] = children[0];
  else if (children.length > 1) merged["children"] = children;
  return jsx(tag, merged);
}

// ── JSX namespace ───────────────────────────────────────────────────────────
//
// Intrinsic-element attribute types come from `types-jsx.ts`: precise per-
// element types when @types/react is installed (`<input>` has `checked`,
// `type`, …), or a permissive fallback when it is not — either way JSX compiles.
// A permissive string index accepts raw HTML/`aria-*`/`data-*`/custom attrs.

export namespace JSX {
  export type Element = VNode;
  export type ElementType = string | ((props: any) => unknown);
  export type IntrinsicElements = CoreIntrinsicElements;
  export interface IntrinsicAttributes {
    key?: string | number | null | undefined;
  }
}

export { jsx, jsxs, jsxDEV, Fragment, VNode, createElement };
export { jsxAttr, jsxEscape, jsxTemplate } from "./jsx-precompile-runtime.js";
