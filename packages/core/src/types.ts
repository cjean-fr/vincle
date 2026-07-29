import type React from "react";
import type { VNode } from "./jsx-runtime.js";

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

export type CSSProperties = React.CSSProperties & {
  [key: `--${string}`]: string | number | undefined;
};

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

type EventToAttr<T> = {
  [K in keyof T]: K extends `on${string}` ? string | undefined : T[K];
};

type VincleOverrides = {
  class?: Awaitable<string | null | undefined>;
  className?: Awaitable<string | null | undefined>;
  children?: VNode;
  style?: Awaitable<string | CSSProperties>;
  dangerouslySetInnerHTML?: { __html: Awaitable<string | null | undefined> };
  htmlFor?: Awaitable<string | null | undefined>;
};

export type FromReact<T> = Omit<StripReact<EventToAttr<T>>, keyof VincleOverrides> &
  VincleOverrides;
