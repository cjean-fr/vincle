import type { JSX } from "./types";

/**
 * Type-level tests — verified via `tsc --noEmit`, not `bun test`.
 * Excluded from build (tsconfig.build.json) but included in type-checking.
 *
 * TEST : IntrinsicElements Fusions
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
    anything: "allowed",
  },
};

export const testSvg: JSX.IntrinsicElements["svg"] = {
  viewBox: "0 0 10 10",
};

export const testCustom: JSX.IntrinsicElements["custom-tag"] = {
  anyProp: 123,
};

declare const element: JSX.IntrinsicElements["div"];
element.onPaste; // Ok (React)
element.class; // Ok (JSX-String)
