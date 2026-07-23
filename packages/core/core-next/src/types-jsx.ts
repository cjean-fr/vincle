// ── Optional @types/react ────────────────────────────────────────────────────
//
// @types/react is an OPTIONAL peer dependency. When it is installed, JSX gets
// precise per-element attribute types (autocomplete for `<input type>`, etc.).
// When it is absent, JSX still type-checks with a permissive fallback — vincle
// itself has zero runtime dependencies and must not hard-require react's types.
//
// The `@ts-ignore` lets the import resolve to `any` when react is missing
// (instead of a hard "Cannot find module" error); `IsReactAvailable` then
// switches every react-derived type to a self-contained fallback. Conditional
// branches are evaluated lazily, so the react-derived branch is never computed
// when react is absent.
// @ts-ignore -- optional peer dependency
import type React from "react";

/** True unless `T` is `any` (i.e. react's types failed to resolve). */
type IsAny<T> = 0 extends 1 & T ? true : false;
export type IsReactAvailable = IsAny<typeof React> extends true ? false : true;

type Awaitable<T> = T | Promise<T>;

/** CSS style object. Precise (`React.CSSProperties`) when react is available,
 * a permissive record otherwise. Custom properties (`--x`) are always allowed. */
export type CSSProperties = IsReactAvailable extends true
  ? React.CSSProperties & { [key: `--${string}`]: string | number | undefined }
  : { [key: string]: string | number | undefined };

// ── React props → vincle HTML props ─────────────────────────────────────────
// (Only instantiated when react is available; see `IntrinsicElements` below.)

type ReactOnlyKeys =
  | "ref" | "key" | "suppressHydrationWarning" | "suppressContentEditableWarning"
  | "defaultChecked" | "defaultValue" | "nonce" | "about" | "datatype" | "inlist"
  | "prefix" | "property" | "resource" | "typeof" | "vocab" | "autoSave" | "results"
  | "security" | "autoCapitalize" | "inputMode" | "is" | "radioGroup" | "spellCheck"
  | "contentEditable" | "contextMenu" | "classID" | "unselectable";

type StripReact<T> = {
  [K in keyof T as K extends ReactOnlyKeys ? never : K]: T[K];
};

type EventToAttr<T> = {
  [K in keyof T]: K extends `on${string}` ? string | undefined : T[K];
};

type VincleOverrides = {
  class?: Awaitable<string | null | undefined>;
  className?: Awaitable<string | null | undefined>;
  children?: unknown;
  style?: Awaitable<string | CSSProperties>;
  dangerouslySetInnerHTML?: { __html: Awaitable<string | null | undefined> };
  htmlFor?: Awaitable<string | null | undefined>;
};

export type FromReact<T> = Omit<StripReact<EventToAttr<T>>, keyof VincleOverrides> & VincleOverrides;

// ── Intrinsic elements ──────────────────────────────────────────────────────

/** Permissive fallback used when @types/react is not installed: any lowercase
 * tag with any attributes. No per-element checking, but JSX still compiles. */
export type PermissiveIntrinsicElements = {
  [tag: string]: Record<string, unknown> & { children?: unknown };
};

/** Precise per-element attribute types derived from react, with react-only
 * props stripped, event handlers as strings, and a permissive string index so
 * raw HTML/`aria-*`/`data-*`/custom attributes are accepted. */
export type ReactIntrinsicElements = {
  [Tag in keyof React.JSX.IntrinsicElements]: FromReact<React.JSX.IntrinsicElements[Tag]> & {
    [attr: string]: unknown;
  };
};

export type IntrinsicElements = IsReactAvailable extends true
  ? ReactIntrinsicElements
  : PermissiveIntrinsicElements;
