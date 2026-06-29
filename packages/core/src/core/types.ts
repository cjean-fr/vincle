export type Awaitable<T> = T | Promise<T>;

interface Stringifiable {
  toString(): string;
}

/**
 * Trusted, already-escaped HTML.
 */
export class RawString implements Stringifiable {
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
 *
 * **Common mistake — `raw()` is *not* for rendering user text.** If you have
 * a string and just want it to appear on the page (with `<`, `>`, `&`
 * displayed as characters), embed it directly — the default behavior already
 * HTML-escapes for you:
 *
 * ```tsx
 * <p>{userText}</p>   // ✅ safe — `<`/`>`/`&` shown as text
 * <p>{raw(userText)}</p>  // ❌ XSS if userText contains <script>...
 * ```
 *
 * ⚠️ **For untrusted HTML that must render *as HTML*** (e.g. forum posts
 * that allow basic formatting), escaping alone is not enough — you need an
 * HTML *sanitizer* (a different tool: it strips dangerous tags/attrs
 * structurally, instead of encoding them). Use
 * [`DOMPurify`](https://github.com/cure53/DOMPurify) or
 * [`sanitize-html`](https://github.com/apostrophecms/sanitize-html) and pass
 * their output to `raw()`.
 *
 * @example
 * ```tsx
 * import { raw } from "@vincle/core";
 *
 * // Trusted source: server-side Markdown renderer.
 * const html = await renderMarkdown(post.body);
 * return <article>{raw(html)}</article>;
 * ```
 */
export const raw = (value: string): RawString => new RawString(value);

/**
 * CSS Properties that allow any property name, including CSS variables.
 * When @types/react is installed, style autocompletion comes from React.CSSProperties
 * via the normal tsconfig jsxImportSource chain — no extra setup needed.
 */
export interface CSSProperties {
  [key: string]: string | number | undefined;
}

/**
 * Event handlers expressed as static strings instead of functions.
 * Common handlers are listed explicitly for dot-notation access;
 * all others are covered by the [key: string]: any index signature on HTMLAttributes.
 */
export type StringEventHandlers = {
  onClick?: string;
  onChange?: string;
  onInput?: string;
  onSubmit?: string;
  onFocus?: string;
  onBlur?: string;
  onKeyDown?: string;
  onKeyUp?: string;
  onKeyPress?: string;
  onMouseEnter?: string;
  onMouseLeave?: string;
  onMouseOver?: string;
  onMouseOut?: string;
  onMouseMove?: string;
  onMouseDown?: string;
  onMouseUp?: string;
  onTouchStart?: string;
  onTouchEnd?: string;
  onTouchMove?: string;
  onPaste?: string;
  onCopy?: string;
  onCut?: string;
  onScroll?: string;
  onLoad?: string;
  onError?: string;
  onSelect?: string;
  onDrag?: string;
  onDrop?: string;
  onDragOver?: string;
  onDragStart?: string;
  onDragEnd?: string;
  onContextMenu?: string;
  onDoubleClick?: string;
  onWheel?: string;
  onResize?: string;
  onAbort?: string;
  onCanPlay?: string;
  onPlay?: string;
  onPause?: string;
  onEnded?: string;
};

/**
 * Strip event handlers and layout props from T, then reattach them as static-friendly versions.
 * Works standalone — does not require @types/react.
 */
export type StaticAttributes<T = {}> = {
  [
    K in keyof T as K extends
      `on${string}` | "children" | "style" | "class" | "className"
      ? never
      : K
  ]: T[K];
} & {
  class?: Awaitable<string | null | undefined>;
  className?: Awaitable<string | null | undefined>;
  style?: Awaitable<string | CSSProperties>;
  children?: VincleNode;
  dangerouslySetInnerHTML?: {
    __html: Awaitable<string | null | undefined>;
  };
} & StringEventHandlers;

/**
 * Base attributes shared by all HTML elements.
 * Permissive by default: [key: string]: any allows any valid HTML attribute.
 * When @types/react is installed, StaticAttributes<React.HTMLAttributes<any>> gives richer autocomplete.
 */
export interface HTMLAttributes extends StaticAttributes {
  id?: string;
  class?: Awaitable<string | null | undefined>;
  className?: Awaitable<string | null | undefined>;
  style?: Awaitable<string | CSSProperties>;
  children?: VincleNode;
  dangerouslySetInnerHTML?: {
    __html: Awaitable<string | null | undefined>;
  };
  lang?: string;
  dir?: "ltr" | "rtl" | "auto";
  role?: string;
  tabIndex?: number;
  tabindex?: number;
  title?: string;
  hidden?: boolean | string;
  slot?: string;
  /** Catch-all for any other HTML or data attribute */
  [key: string]: any;
}

/**
 * Base attributes shared by all SVG elements.
 */
export interface SVGAttributes extends HTMLAttributes {
  viewBox?: string;
  xmlns?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: string | number;
  width?: string | number;
  height?: string | number;
  d?: string;
  cx?: string | number;
  cy?: string | number;
  r?: string | number;
  x?: string | number;
  y?: string | number;
}

/**
 * Anything Vincle can render — the public "renderable" type, analogous to
 * React's `ReactNode`. Use it to annotate values that hold markup, a
 * component's `children`, or the return type of a helper that produces content.
 *
 * Prefer `VincleNode` over `JSX.Element` in your own annotations: `JSX.Element`
 * is the factory's return contract (its name is imposed by the TS JSX checker),
 * and a *bare* `JSX.Element` resolves to whatever declares the global `JSX`
 * namespace — which is React's when `@types/react` is present. `VincleNode` is a
 * plain export, so it can never be captured by that global.
 */
export type VincleNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | Stringifiable
  | Promise<VincleNode>
  | VincleNode[]
  | Iterable<VincleNode>
  | AsyncIterable<VincleNode>;

export type Component<P = {}> = (
  props: P & HTMLAttributes & { children?: VincleNode },
) => VincleNode;

/**
 * JSX Namespace for the internal factory.
 * Per-element attribute checking (img → src, a → href, …) is available
 * automatically when @types/react is installed, via the jsxImportSource chain.
 */
export namespace JSX {
  export type Element = Awaitable<RawString>;
  /**
   * What may appear as a JSX tag: an intrinsic tag name, or a component
   * function returning a `VincleNode` (async components included). Without
   * this, TS falls back to requiring a component's return to be assignable to
   * `JSX.Element`, which rejects the wider `VincleNode` that `Component` and
   * `Fragment` return — making `<Fragment>` and `<MyComponent>` fail to typecheck.
   */
  export type ElementType = string | ((props: any) => VincleNode);
  export interface IntrinsicElements {
    [tag: string]: HTMLAttributes;
  }
  export interface IntrinsicAttributes {
    key?: string | number | null | undefined;
    [key: string]: any;
  }
  export interface ElementAttributesProperty {
    props: {};
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
}
