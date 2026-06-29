interface Stringifiable {
  toString(): string;
}

export type VincleNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | Stringifiable
  //   any object with toString() — e.g. RawString from raw()
  | Promise<VincleNode>
  | VincleNode[]
  | Iterable<VincleNode>
  | AsyncIterable<VincleNode>;
