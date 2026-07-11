import type React from "react";
import type { Awaitable, VNode } from "./render.js";

// ── CSSProperties via csstype (re-exported from @types/react) ──────────
// Extended with custom properties (--custom-var) which csstype doesn't cover.

export type CSSProperties = React.CSSProperties & {
  [key: `--${string}`]: string | number | undefined;
};

// ── React-only props stripped from the mapped types ────────────────────
// These are internal React concepts (ref, hydration, synthetic events, etc.)
// with no equivalent in static HTML.

type ReactOnlyKeys =
  | "ref"
  | "key"
  | "suppressHydrationWarning"
  | "suppressContentEditableWarning"
  | "defaultChecked"
  | "defaultValue"
  | "nonce"
  | "about"
  | "datatype"
  | "inlist"
  | "prefix"
  | "property"
  | "resource"
  | "typeof"
  | "vocab"
  | "autoSave"
  | "results"
  | "security"
  | "autoCapitalize"
  | "inputMode"
  | "is"
  | "radioGroup"
  | "spellCheck"
  | "contentEditable"
  | "contextMenu"
  | "classID"
  | "unselectable";

type StripReact<T> = {
  [K in keyof T as K extends ReactOnlyKeys ? never : K]: T[K];
};

// ── Event handlers: function refs → string attributes ─────────────────

type EventToAttr<T> = {
  [K in keyof T]: K extends `on${string}` ? string | undefined : T[K];
};

// ── Props we override with vincle-specific semantics ───────────────────

type VincleOverrides = {
  class?: Awaitable<string | null | undefined>;
  className?: Awaitable<string | null | undefined>;
  children?: VNode;
  style?: Awaitable<string | CSSProperties>;
  dangerouslySetInnerHTML?: {
    __html: Awaitable<string | null | undefined>;
  };
  // `htmlFor` maps to the HTML `for` attribute (see escape.ts) and is valid on
  // every element, not just `<label>` — so it's exposed globally here.
  htmlFor?: Awaitable<string | null | undefined>;
};

// ── React → Vincle type transform ──────────────────────────────────────
// Strips React-only props, converts event handlers to strings, and applies
// vincle-specific overrides (children, style, dangerouslySetInnerHTML, class).

export type FromReact<T> = Omit<StripReact<EventToAttr<T>>, keyof VincleOverrides> &
  VincleOverrides;

// ── Intrinsic elements derived from @types/react ───────────────────────
// Every HTML/SVG element React knows about gets per-element attribute typing.
// Augment `React.JSX.IntrinsicElements` in your project to add custom elements.

export type IntrinsicElements = {
  [Tag in keyof React.JSX.IntrinsicElements]: FromReact<
    React.JSX.IntrinsicElements[Tag]
  >;
};

// ── Named attribute types (for programmatic use) ───────────────────────

export type HTMLAttributes = IntrinsicElements["div"];
export type SVGAttributes = IntrinsicElements["svg"];

// ── String event handlers (HTML attribute syntax: onclick="…") ─────────
// Derived from React's DOMAttributes to cover every event (60+).

export type StringEventHandlers = {
  [K in keyof React.DOMAttributes<HTMLElement> as K extends `on${string}`
    ? K
    : never]: string;
};

// ── Static attributes (everything except events, children, style) ──────

export type StaticAttributes<T = {}> = Omit<
  HTMLAttributes,
  | "children"
  | "style"
  | "dangerouslySetInnerHTML"
  | "class"
  | "className"
  | keyof StringEventHandlers
> &
  T;
