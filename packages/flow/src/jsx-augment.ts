// Flow owns its experimental template attributes and Turbo elements.
// Extend each public JSX entry point so production, development, and explicit
// JSX type imports receive the same additions. Custom element props remain
// type literals to satisfy Core’s custom-element index signature.

import type { Awaitable, JSX as CoreJSX, RawString, RawUrl, Renderable } from "@vincle/core";
import type {} from "@vincle/core/jsx-dev-runtime";
import type {} from "@vincle/core/jsx-runtime";

/** Experimental WICG Fragment Include attributes, enabled by Flow. */
interface FragmentIncludeAttributes {
  src?: Awaitable<string | undefined | RawString | RawUrl>;
  buffer?: Awaitable<boolean | undefined>;
  sanitize?: Awaitable<boolean | "" | "unsafe" | undefined>;
  crossOrigin?: CoreJSX.ImgHTMLAttributes["crossOrigin"];
  crossorigin?: CoreJSX.ImgHTMLAttributes["crossorigin"];
  referrerPolicy?: CoreJSX.ImgHTMLAttributes["referrerPolicy"];
  referrerpolicy?: CoreJSX.ImgHTMLAttributes["referrerpolicy"];
}

interface FlowIntrinsicElements {
  "turbo-frame": {
    id?: Awaitable<string | number> | undefined;
    src?: Awaitable<string> | undefined;
    target?: Awaitable<string> | undefined;
    children?: Renderable;
  };
  "turbo-stream": {
    action?: Awaitable<string> | undefined;
    method?: Awaitable<string> | undefined;
    target?: Awaitable<string> | undefined;
    children?: Renderable;
  };
}

declare module "@vincle/core" {
  namespace JSX {
    interface TemplateHTMLAttributes extends FragmentIncludeAttributes {}
    interface IntrinsicElements extends FlowIntrinsicElements {}
  }
}

declare module "@vincle/core/jsx-runtime" {
  namespace JSX {
    interface TemplateHTMLAttributes extends FragmentIncludeAttributes {}
    interface IntrinsicElements extends FlowIntrinsicElements {}
  }
}

declare module "@vincle/core/jsx-dev-runtime" {
  namespace JSX {
    interface TemplateHTMLAttributes extends FragmentIncludeAttributes {}
    interface IntrinsicElements extends FlowIntrinsicElements {}
  }
}
