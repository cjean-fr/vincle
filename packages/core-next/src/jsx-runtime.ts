import { raw } from "./raw.js";

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

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode {
  const { children, key, ref, dangerouslySetInnerHTML, ...rest } = attributes ?? {};
  const finalChildren = dangerouslySetInnerHTML !== undefined
    ? raw(String((dangerouslySetInnerHTML as { __html: unknown }).__html ?? ""))
    : children;
  return new VNode(tag, rest, finalChildren);
}

const jsxs = jsx;

function Fragment({ children }: { children?: unknown }) {
  return children;
}

export { jsx, jsxs, Fragment, VNode };
