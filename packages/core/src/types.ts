// ── VNode ──────────────────────────────────────────────────────────────────
//
// Defined here (not in `jsx-runtime.ts`) because both `render.ts` and
// `jsx-runtime.ts` test `instanceof VNode`; living in the module both already
// import keeps the dependency acyclic.

/**
 * One element of the tree: a tag, its props, its children. Pure representation —
 * the tag is validated at the door (`jsx()`), so the tree walk trusts what it finds.
 */
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

/** Markup whose component holes must be evaluated at render time. */
export class TemplateNode implements Promise<RawString> {
  readonly [Symbol.toStringTag] = "Promise";
  readonly render: () => RawString | Promise<RawString>;
  constructor(render: () => RawString | Promise<RawString>) {
    this.render = render;
  }

  // oxlint-disable-next-line unicorn/no-thenable -- Preserves await on jsxTemplate for existing callers.
  then<TResult1 = RawString, TResult2 = never>(
    onfulfilled?: ((value: RawString) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve().then(this.render).then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<RawString | TResult> {
    return this.then(undefined, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<RawString> {
    return this.then().finally(onfinally);
  }
}

/**
 * Mark a string as trusted HTML: rendered verbatim, unescaped. The only way to
 * bypass escaping, and deliberately greppable — audit `raw(` call sites to audit safety.
 */
export const raw = (value: string): RawString => new RawString(value);

/** A value, or a promise of that value. */
export type Awaitable<T> = T | Promise<T>;

/**
 * What a component may *return* — much wider than `JSX.Element` (only what `jsx()`
 * produces). Keeping the two apart is what removes the casts.
 */
export type Renderable = Awaitable<
  | VNode
  | RawString
  | TemplateNode
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Iterable<Renderable>
  | AsyncIterable<Renderable>
>;

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
