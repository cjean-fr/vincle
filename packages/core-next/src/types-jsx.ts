import type React from "react";

type Awaitable<T> = T | Promise<T>;

type VNode = import("./jsx-runtime.js").VNode;

export type CSSProperties = React.CSSProperties & {
  [key: `--${string}`]: string | number | undefined;
};

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
  children?: VNode;
  style?: Awaitable<string | CSSProperties>;
  dangerouslySetInnerHTML?: { __html: Awaitable<string | null | undefined> };
  htmlFor?: Awaitable<string | null | undefined>;
};

export type FromReact<T> = Omit<StripReact<EventToAttr<T>>, keyof VincleOverrides> & VincleOverrides;
