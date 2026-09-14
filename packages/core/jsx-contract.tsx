/**
 * The JSX attribute contract — checked by `bun run check`, not by `bun test`.
 *
 * The counterpart of `type-contract.tsx` (which locks what a component may
 * return): this file locks what an intrinsic element accepts, and the two
 * extension points users have — augmenting `DOMAttributes` for library
 * attributes (htmx here) and declaring custom elements. If a line compiles,
 * the shape it pins is guaranteed; each `@ts-expect-error` fails the check the
 * day its error disappears.
 *
 * @module
 */
import type { Renderable } from "./index.js";

import { raw } from "./index.js";

// user-level extension: an htmx attribute merged on the shared base + a new tag
declare module "./src/jsx-runtime.js" {
  namespace JSX {
    interface DOMAttributes {
      "hx-get"?: string | false;
    }
    interface IntrinsicElements {
      "turbo-frame": { src?: string; children?: Renderable };
    }
  }
}

// A named interface cannot satisfy the custom-element index signature — the
// props type would need an implicit index signature, which interfaces do not
// have. Type literals work; interfaces are a compile error (TS2411).
interface TurboNamed {
  src?: string;
  children?: Renderable;
}
declare module "./src/jsx-runtime.js" {
  namespace JSX {
    interface IntrinsicElements {
      // @ts-expect-error named interface vs the `${string}-${string}` index type
      "turbo-named": TurboNamed;
    }
  }
}

// ── Must compile ────────────────────────────────────────────────────────────

export const ok1 = (
  <a href="/x" target="_blank" download="f.txt">
    x
  </a>
);
export const ok2 = <a href={Promise.resolve("/y")}>x</a>;
export const ok3 = <input type="email" value={42} onChange="x" />;
export const ok4 = <circle cx="10" cy="20" r={5} fill="red" />;
const active: boolean = true;
export const ok5 = (
  <div class={["btn", active && "on"]} style={{ color: "red" }}>
    x
  </div>
);
export const ok6 = <div style="color:red">x</div>;
export const ok7 = <label htmlFor={Promise.resolve("l")}>x</label>;
// Inline handlers are text — any `on*` spelling, camelCase included.
export const ok8 = (
  <div onCustom="alert(1)" onFoo="x">
    x
  </div>
);
export const ok9 = <div dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />;
export const ok10 = <div key="k">x</div>;
export const ok11 = <div hx-get="/z">x</div>;
export const ok12 = <a hx-get="/z">x</a>;
export const ok13 = <turbo-frame src="/feed">x</turbo-frame>;
export const ok14 = <my-widget data-x="1">x</my-widget>;
export const ok15 = <form action={raw("/go")}>x</form>;
export const ok16 = (
  <svg width="10">
    <path d="M0 0" />
  </svg>
);
export const ok17 = <input autoComplete="section-credit-card cc-number" />;
// (string & {}) escape in HTMLInputTypeAttribute — accepted, same as React
export const ok18 = <input type="emal" />;
// CSS variables pass through the `--${string}` index signature
export const ok19 = <div style={{ "--brand": 1 }}>x</div>;

// ── Must NOT compile ────────────────────────────────────────────────────────

// @ts-expect-error unknown standard tags are not elements
export const eTagTypo = <divv>x</divv>;
// @ts-expect-error
export const e1 = <a href={42}>x</a>;
// @ts-expect-error
export const e2 = <input capture="nope" />;
// @ts-expect-error
export const e3 = <div class={42}>x</div>;
// @ts-expect-error
export const e4 = <div onFoo={42}>x</div>;
// @ts-expect-error
export const e6 = <a ref={() => {}}>x</a>;
// @ts-expect-error
export const e7 = <div hx-get={42}>x</div>;
// @ts-expect-error
export const e8 = <label htmlFor={42}>x</label>;
// @ts-expect-error
export const e9 = <circle r={true} />;
// @ts-expect-error
export const e10 = <div style={42}>x</div>;

// Pin the alias-derived unions (HTMLInputTypeAttribute, Booleanish,
// HTMLAttributeAnchorTarget, CrossOrigin). If the generated table ever loses
// its `type` aliases again, these attributes silently become `any` and the
// expect-error lines below go unused — which fails the check.
// @ts-expect-error
export const e11 = <input type={42} />;
// @ts-expect-error
export const e12 = <div aria-hidden={42}>x</div>;
// @ts-expect-error
export const e13 = <a target={42}>x</a>;
// @ts-expect-error
export const e14 = <img src="x" crossOrigin={42} />;
// @ts-expect-error
export const e15 = <div role={42}>x</div>;
