import type React from "react";

import { invalidTagMessage, isValidTag } from "./tag.js";

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

  /**
   * Validates a string tag, because this class is exported as a value: the
   * precompile contract needs `instanceof VNode`, and an exported class is a
   * constructor whoever holds it may call. The tree walk does not re-check the
   * tag — so a name that got in here unexamined reached the document verbatim,
   * closing tags and all. The check costs one call per element, the same one
   * `jsx()` used to make above the fold/VNode fork.
   */
  constructor(
    tag: string | ((props: any) => any),
    attrs: Record<string, unknown>,
    children: unknown,
  ) {
    if (typeof tag === "string" && !isValidTag(tag)) throw new TypeError(invalidTagMessage(tag));
    this.tag = tag;
    this.attrs = attrs;
    this.children = children;
  }
}

/** Trusted, already-escaped HTML — rendered verbatim. Build one with {@link raw}. */
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
 * Mark a string as trusted HTML: rendered verbatim, unescaped.
 *
 * The only way to bypass escaping, and deliberately greppable — auditing output
 * safety means auditing the `raw(` call sites.
 *
 * @example
 * ```tsx
 * const body = await markdownToHtml(post.body);
 * <article>{raw(body)}</article>;  // verbatim
 * <article>{post.body}</article>;  // escaped
 * ```
 */
export const raw = (value: string): RawString => new RawString(value);

/** A value, or a promise of that value. */
export type Awaitable<T> = T | Promise<T>;

/**
 * What a component may *return* — much wider than `JSX.Element`, which is only
 * what `jsx()` produces. Keeping the two apart is what removes the casts.
 *
 * @example
 * ```tsx
 * const Text = () => "du texte";
 * const List = () => [<li>un</li>, <li>deux</li>];
 * const Maybe = async () => (await load()) ?? null;
 * ```
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
// The 180 elements come from `@types/react`, an optional peer: nothing is
// imported at runtime. Without it, `skipLibCheck` masks the unresolved import
// and attributes go unchecked — which only holds because `types` points at
// `.d.mts`, which `skipLibCheck` covers, never at the `.ts` sources.

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
