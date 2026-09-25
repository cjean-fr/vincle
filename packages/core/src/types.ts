// ── VNode ──────────────────────────────────────────────────────────────────
//
// Defined here (not in `jsx-runtime.ts`) because both `render.ts` and
// `jsx-runtime.ts` test `instanceof VNode`; living in the module both already
// import keeps the dependency acyclic.

/**
 * One element of the tree: a tag, its props, its children. Pure representation,
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

/** Trusted, already-escaped HTML: rendered verbatim. Build one with {@link raw}. */
export class RawString {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }

  /**
   * Makes this class nominally distinct from {@link RawUrl}. Both declare the
   * same public members, so structural typing alone would let either stand in
   * for the other — while the renderer, which tests `instanceof`, treats them in
   * opposite ways: `raw()` is emitted verbatim, a `RawUrl` is escaped. A private
   * member on *both* sides is what says "two promises, not one shape twice", so
   * handing a `RawUrl` to a `RawString` parameter is a type error rather than a
   * value that quietly stops being markup.
   */
  declare private readonly __raw: undefined;
}

/**
 * A URL whose scheme this runtime will not judge. Build one with {@link rawUrl}.
 *
 * A separate type from {@link RawString} because the promise is narrower, and
 * the difference shows in every position: a `RawString` is markup, so it is
 * emitted verbatim, while a `RawUrl` is a URL, so it is escaped like any other
 * value and only the scheme check is skipped. That is what makes it harmless to
 * hand a `RawUrl` to a plain `title` by mistake, and what keeps it from
 * becoming an HTML injection primitive the way `raw()` is.
 */
export class RawUrl {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }

  /**
   * Makes this class nominally distinct from {@link RawString}, which it would
   * otherwise be interchangeable with: the two have identical members, so
   * structural typing would let a `RawUrl` be passed wherever a `RawString` is
   * declared — and the runtime, which tests `instanceof`, treats them in opposite
   * ways. A `private` member is the standard way to say "these are two classes,
   * not one shape twice": neither is assignable to the other, so a mistake here
   * is a type error instead of a silently escaped `raw()`.
   */
  declare private readonly __url: undefined;
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
 * bypass escaping, and deliberately greppable: audit `raw(` call sites to audit safety.
 */
export const raw = (value: string): RawString => new RawString(value);

/**
 * Mark a URL as trusted: its scheme is not judged, and nothing else changes.
 *
 * The narrow escape hatch for a scheme off the filter's allowlist (relative,
 * `http`, `https`, `mailto`, `tel`, `sms`, image `data:`): a custom protocol
 * handler (`phpstorm://`, `vscode://`, `slack://`) or `geo:` is blocked unless
 * the application vouches for it here.
 *
 * The value is still escaped, so it cannot end its attribute or reopen the tag,
 * and in content position it is text like any other — `raw()` gives all of that
 * up along with the check. Reach for `raw()` when the value is markup; for a
 * URL, this says exactly what is being vouched for.
 *
 * @example
 * ```tsx
 * <a href={rawUrl("phpstorm://open?file=src/app.ts")}>open in the IDE</a>
 * ```
 */
export const rawUrl = (value: string): RawUrl => new RawUrl(value);

/** A value, or a promise of that value. */
export type Awaitable<T> = T | Promise<T>;

/**
 * What a component may *return*: much wider than `JSX.Element` (only what `jsx()`
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
