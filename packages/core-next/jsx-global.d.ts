import type { VNode } from "./src/jsx-runtime.js";

declare global {
  namespace JSX {
    type Element = VNode;
    type IntrinsicElements = {
      [K in string]: Record<string, unknown> & { children?: unknown };
    };
  }
}
