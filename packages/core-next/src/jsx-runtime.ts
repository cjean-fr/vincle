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
  const finalChildren =
    props.dangerouslySetInnerHTML !== undefined
      ? raw(String((props.dangerouslySetInnerHTML as { __html: unknown }).__html ?? ""))
      : props.children;
  return new VNode(tag, props, finalChildren);
}

const jsxs = jsx;

function Fragment({ children }: { children?: unknown }) {
  return children;
}

export { jsx, jsxs, Fragment, VNode };
