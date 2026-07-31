import type { RawString, VNode } from "@vincle/core";

// `Renderable` — everything a component may return, and everything the
// renderers know how to render.
export type Renderable =
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
  | Promise<Renderable>;
