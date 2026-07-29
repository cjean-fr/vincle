import type { Renderable } from "./types.js";

import { jsxAttr, jsxEscape, jsxTemplate } from "./jsx-precompile-runtime.js";
import { raw, RawString } from "./raw.js";
import { tryRenderStatic, NOT_STATIC } from "./static-render.js";

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

// ── jsx — hybrid: single-pass fold of static trees, VNode for dynamic ─────
//
// A string-tag element is folded to a RawString in one traversal by
// `tryRenderStatic`; it returns NOT_STATIC the moment it hits a dynamic node
// (component, VNode child, Promise, function, or an unfoldable prop), and we
// fall through to a VNode for the tree-walk renderer.

// The return type says `VNode | RawString` because that is what happens: a
// folded element *is* a RawString, and claiming otherwise only bought a cast.
// `RawString` is a first-class renderable leaf, so it belongs in the signature
// (same reasoning as `JSX.Element` in index.ts).
function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode | RawString {
  const props = attributes ?? {};

  if (typeof tag === "string") {
    const folded = tryRenderStatic(tag, props);
    if (folded !== NOT_STATIC) return folded;
  }

  // Dynamic path: create VNode for tree-walk rendering
  const finalChildren =
    props["dangerouslySetInnerHTML"] !== undefined
      ? raw(String((props["dangerouslySetInnerHTML"] as { __html: unknown }).__html ?? ""))
      : props["children"];
  return new VNode(tag, props, finalChildren);
}

const jsxs = jsx;

// A fragment renders its children and disappears. Saying so needs no cast: what
// comes in is renderable, what goes out is the same thing. `JSX.ElementType`
// (index.ts) is what lets TypeScript accept a component typed this way.
function Fragment({ children }: { children?: Renderable }): Renderable {
  return children;
}

export { jsx, jsxs, jsxAttr, jsxEscape, jsxTemplate, Fragment, VNode };
