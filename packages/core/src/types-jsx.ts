import type { VNode } from "./render.js";

export type Awaitable<T> = T | Promise<T>;

export interface CSSProperties {
  [key: string]: string | number | undefined;
}

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
  children?: VNode;
  dangerouslySetInnerHTML?: {
    __html: Awaitable<string | null | undefined>;
  };
} & StringEventHandlers;

export interface HTMLAttributes extends StaticAttributes {
  id?: string;
  class?: Awaitable<string | null | undefined>;
  className?: Awaitable<string | null | undefined>;
  style?: Awaitable<string | CSSProperties>;
  children?: VNode;
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
  [key: string]: any;
}

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
}
