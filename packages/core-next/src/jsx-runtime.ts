class VNode {
  readonly tag: string | ((props: any) => any);
  readonly attrs: Record<string, unknown>;
  readonly children: unknown;

  constructor(tag: string | ((props: any) => any), attrs: Record<string, unknown>) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = attrs.children;
  }
}

function jsx(
  tag: string | ((props: any) => any),
  attributes: Record<string, unknown> | null,
): VNode {
  return new VNode(tag, attributes ?? {});
}

const jsxs = jsx;

function Fragment({ children }: { children?: unknown }) {
  return children;
}

export { jsx, jsxs, Fragment, VNode };
