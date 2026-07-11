import type { RawString } from "@vincle/core";

export type VNode =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | RawString
  | Promise<VNode>
  | VNode[]
  | Iterable<VNode>
  | AsyncIterable<VNode>;
