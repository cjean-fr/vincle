import type { VNode } from "./jsx-runtime.js";
import type { RawString } from "./raw.js";

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
  // Un composant peut être un générateur async — `renderNode` le détecte
  // (`isAsyncIterable`) et le draine dans `collectAsyncIterable`, comme
  // `streamNode` le fait dans `streamAsyncIterable`.
  | AsyncIterable<Renderable>
  | Promise<Renderable>;
