import type React from "react";

// ── VNode ──────────────────────────────────────────────────────────────────
//
// Defined here, not in `jsx-runtime.ts`, because `render.ts` (which owns the
// tree walk) and `jsx-runtime.ts` (which owns the precompile helpers) both
// test `instanceof VNode`, and `jsxTemplate` renders VNodes through the tree
// walk. Living in `types.ts` — the module both already import — keeps that
// dependency acyclic: `jsx-runtime` → `render` would otherwise be a cycle.

export class VNode {
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

// ── Trusted HTML ──────────────────────────────────────────────────────────

/**
 * Trusted, already-escaped HTML.
 * Passed verbatim through the render pipeline without escaping.
 */
export class RawString {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

/**
 * Mark an HTML string as trusted: it will be rendered verbatim without HTML
 * escaping. Use this for HTML you generated yourself or from a source you
 * fully trust — typically a Markdown renderer's output or a templating helper.
 */
export const raw = (value: string): RawString => new RawString(value);

// ── Core types ────────────────────────────────────────────────────────────

/** A value, or a promise of that value. */
export type Awaitable<T> = T | Promise<T>;

/**
 * Everything the renderers know how to render — the counterpart of React's
 * `ReactNode`.
 *
 * `JSX.Element` describes what `jsx()` *produces*: a `VNode`, or a `RawString`
 * when the static fold succeeded. `Renderable` describes what a component may
 * *return*, which is a much wider set — `renderNode` handles primitives, holes,
 * arrays and promises just as well as nodes.
 *
 * Keeping the two apart is what removes the casts: a `Fragment` returning its
 * children, or a component written as `() => "text"`, is honestly typed instead
 * of being forced through `as unknown as VNode`. `JSX.ElementType` in `index.ts`
 * is what makes TypeScript accept those components.
 */
export type Renderable = Awaitable<
  | VNode
  | RawString
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Iterable<Renderable>
  | AsyncIterable<Renderable>
>;

// ── JSX types ─────────────────────────────────────────────────────────────
//
// The attribute types of every HTML and SVG element are derived from
// `@types/react` rather than hand-maintained: that list is 180 elements and a
// few thousand attributes, it tracks the platform, and a copy of it would be
// wrong within a release. What `FromReact` does is turn React's *client* props
// into vincle's *serialization* props — three differences, each one a rule the
// engine actually applies (see `attrs.ts`):
//
//   1. React-only props are removed. `ref`, `defaultValue`, `suppressHydration…`
//      mean something to a reconciler and nothing to an HTML string.
//   2. `on*` handlers are strings. Vincle emits `onclick="…"`; a function is
//      unserializable and `buildAttrs` throws on one.
//   3. Every value accepts a `RawString` (trusted, unescaped) or a promise.
//
// `@types/react` is a *type-only*, optional peer dependency — nothing is imported
// at runtime, so the package stays dependency-free. A consumer who skips it does
// not get a broken build: `skipLibCheck` (on in `@vincle/typescript-config`, and
// the norm elsewhere) suppresses the unresolved import inside the shipped
// declarations, and element attributes simply stop being checked. Renders are
// unaffected either way — none of this exists at runtime.

export type CSSProperties = React.CSSProperties & {
  [key: `--${string}`]: string | number | undefined;
};

/**
 * A `class` attribute. The array form is what `classToString` accepts: a flat
 * list whose falsy entries are dropped, so `class={["btn", active && "on"]}`
 * needs no helper.
 */
export type ClassValue =
  | string
  | false
  | null
  | undefined
  | readonly (string | false | null | undefined)[];

// Props that mean something to a reconciler, or to no HTML parser at all.
// `buildAttrs` skips or refuses them; rejecting them at compile time is the same
// answer, given earlier.
//
// The line is "does this end up in the document" — nothing else. The list used to
// be much longer and cut on the wrong side of it: `nonce` (the CSP attribute!),
// `is`, `inputMode`, `spellCheck`, `contentEditable`, `autoCapitalize` and the
// whole RDFa family (`property`, `about`, `typeof`, `vocab`, …) are ordinary HTML
// attributes that `resolveAttrName` lowercases and emits correctly. Removing them
// made `<meta property="og:title">` — the canonical Open Graph tag — a type error,
// and it took typing the intrinsic elements for anyone to find out.
//
// `key` is not here either: React supplies it to intrinsic elements through
// `ClassAttributes`, and TypeScript only consults `JSX.IntrinsicAttributes` for
// components, so stripping it broke every keyed list. It is dropped at
// serialization time, which is what makes accepting it harmless.
type ReactOnlyKeys =
  // Reconciler-only.
  | "ref"
  | "suppressHydrationWarning"
  | "suppressContentEditableWarning"
  | "defaultChecked"
  | "defaultValue"
  | "radioGroup"
  // Non-standard vendor leftovers React still exposes; no HTML parser reads them.
  | "autoSave"
  | "results"
  | "security"
  | "classID"
  | "unselectable";

type StripReact<T> = {
  [K in keyof T as K extends ReactOnlyKeys ? never : K]: T[K];
};

/**
 * Widen each declared value to what the serializer accepts: the value itself, a
 * trusted `RawString`, or a promise of either. `on*` becomes a string — inline
 * script is text in HTML, and only text.
 */
type ToAttrValue<T> = {
  [K in keyof T]: K extends `on${string}`
    ? Awaitable<string> | undefined
    : Awaitable<T[K] | RawString>;
};

/**
 * The props whose vincle meaning differs from React's, applied last so they win.
 */
type VincleOverrides = {
  /** Lifted out of props by the transform; never serialized. */
  key?: string | number | bigint | null | undefined;
  class?: Awaitable<ClassValue>;
  className?: Awaitable<ClassValue>;
  /** Anything the renderers can render — not just an element. */
  children?: Renderable;
  style?: Awaitable<string | CSSProperties | RawString | null | undefined>;
  dangerouslySetInnerHTML?: { __html: string | null | undefined };
  htmlFor?: Awaitable<string | null | undefined>;
};

/**
 * Inline event handlers, in either spelling.
 *
 * Handlers are the one family where both forms are typed. `@types/react` declares
 * them as *functions*, so they have to be redeclared here whatever happens — and
 * once you are redeclaring them, a fixed list is the wrong shape: the set is large
 * and the platform keeps adding to it. Every other attribute keeps React's
 * camelCase spelling, which `resolveAttrName` maps to the HTML name — so
 * `tabIndex` is the way to write `tabindex`, and a typo is still a typo.
 *
 * The value must be text; a function throws in `buildAttrs`, on both paths.
 */
type InlineHandlers = { [K in `on${string}`]?: Awaitable<string> };

export type FromReact<T> = Omit<StripReact<ToAttrValue<T>>, keyof VincleOverrides> &
  VincleOverrides &
  InlineHandlers;

/**
 * Attribute types for every intrinsic element, derived from `@types/react`.
 *
 * Augmenting `React.JSX.IntrinsicElements` flows through here automatically,
 * which is how `@vincle/flow` registers `<turbo-frame>` and `<turbo-stream>`.
 */
export type IntrinsicElementsFromReact = {
  [K in keyof React.JSX.IntrinsicElements]: FromReact<React.JSX.IntrinsicElements[K]>;
};

/**
 * Custom elements stay open. A hyphen in the name is what makes an element custom
 * per the HTML spec, and no type can know what a `<my-widget>` accepts — but the
 * *shape* is still pinned: children are `Renderable`, not `any`.
 */
export type CustomElements = {
  [K in `${string}-${string}`]: Record<string, unknown> & { children?: Renderable };
};
