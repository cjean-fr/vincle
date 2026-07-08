import type { Component, Descriptor, VincleNode, JSX } from "./core/types.js";

export type { JSX };
export { jsxAttr, jsxEscape, jsxTemplate } from "./precompile.js";

export function jsx<P extends {} = {}>(
  type: string | Component<P>,
  props: P,
  key?: unknown,
): JSX.Element {
  return { type, props, key } as unknown as Descriptor;
}

export const jsxs: typeof jsx = jsx;

export function Fragment({
  children,
}: {
  children?: VincleNode;
}): VincleNode | undefined {
  return children;
}
