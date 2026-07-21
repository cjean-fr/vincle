import { raw, RawString } from "./raw.js";
import { renderStatic } from "./static-render.js";

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

// ── Static subtree detection ────────────────────────────────────────────
// An element is "static" when its entire subtree contains no components,
// no style objects, no class arrays, no dangerouslySetInnerHTML, no
// Promises, and no function children. Static subtrees can be pre-rendered
// to a RawString at jsx() time, saving VNode allocation + tree-walk cost.

function isStaticChild(child: unknown): boolean {
  if (child === null || child === undefined || typeof child === "boolean") return true;
  if (typeof child === "string" || typeof child === "number") return true;
  if (child instanceof RawString) return true;      // already pre-rendered
  if (child instanceof VNode) return false;          // dynamic child → I'm dynamic too
  if (child instanceof Promise) return false;
  if (typeof child === "function") return false;
  if (Array.isArray(child)) {
    for (let i = 0; i < child.length; i++) {
      if (!isStaticChild(child[i]!)) return false;
    }
    return true;
  }
  return false; // unknown type → don't risk it
}

function isStaticElement(
  tag: string | ((props: any) => any),
  props: Record<string, unknown>,
): boolean {
  if (typeof tag === "function") return false;

  for (const key in props) {
    if (key === "children" || key === "key" || key === "ref") continue;
    const v = props[key];
    if (key === "dangerouslySetInnerHTML") return false;
    if (key === "style" && typeof v === "object" && !Array.isArray(v)) return false;
    if (key === "class" && Array.isArray(v)) return false;
    if (v instanceof Promise) return false;
  }

  return isStaticChild(props.children);
}

// ── jsx — hybrid: pre-render static trees, VNode for dynamic ─────────

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode {
  const props = attributes ?? {};

  // Fast path: fully static element → render to string directly
  if (typeof tag === "string") {
    const children = props.children;
    if (isStaticChild(children)) {
      // Check remaining props for static-safety
      let staticTree = true;
      for (const key in props) {
        if (key === "children" || key === "key" || key === "ref") continue;
        const v = props[key];
        if (key === "dangerouslySetInnerHTML") { staticTree = false; break; }
        if (key === "style" && typeof v === "object" && !Array.isArray(v)) { staticTree = false; break; }
        if (key === "class" && Array.isArray(v)) { staticTree = false; break; }
        if (v instanceof Promise) { staticTree = false; break; }
      }
      if (staticTree) {
        return renderStatic(tag, props, children) as unknown as VNode;
      }
    }
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
