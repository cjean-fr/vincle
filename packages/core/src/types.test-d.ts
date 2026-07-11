import type { JSX } from "./jsx-runtime";

/**
 * Type-level tests — verified via `tsc --noEmit`, not `bun test`.
 * Excluded from build (tsconfig.build.json) but included in type-checking.
 *
 * TEST : IntrinsicElements leveraging @types/react
 */

export const testReactProps: JSX.IntrinsicElements["div"] = {
  onClick: "alert('clicked')",
  className: "from-react",
};

export const testOurProps: JSX.IntrinsicElements["div"] = {
  class: "from-us",
  style: {
    color: "red",
    "--my-var": "10px",
  },
};

export const testSvg: JSX.IntrinsicElements["svg"] = {
  viewBox: "0 0 10 10",
  fill: "none",
  stroke: "currentColor",
};

export const testInput: JSX.IntrinsicElements["input"] = {
  type: "text",
  checked: true,
  placeholder: "Enter name",
};

export const testAnchor: JSX.IntrinsicElements["a"] = {
  href: "/page",
  target: "_blank",
  rel: "noopener",
};

export const testEvents: JSX.IntrinsicElements["button"] = {
  onClick: "submitForm()",
  onMouseEnter: "highlight(this)",
};

declare const element: JSX.IntrinsicElements["div"];
element.onPaste;
element.class;

/**
 * Custom elements: augment `React.JSX.IntrinsicElements` in your project:
 *
 *   declare global {
 *     namespace React.JSX {
 *       interface IntrinsicElements {
 *         "my-widget": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
 *       }
 *     }
 *   }
 *
 * They then automatically appear in `JSX.IntrinsicElements` via the mapped type.
 */
