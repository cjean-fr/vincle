import type { Awaitable } from "./types.js";

declare const __brand: unique symbol;

/**
 * A context key. A `symbol` at runtime — the brand is phantom, and exists only
 * so `useContext(key)` knows what `key` was declared to hold.
 *
 * Intersecting with `symbol` rather than wrapping it is what removes the casts
 * at every call site: a `ContextKey<T>` *is* a valid `ContextMap` key, so
 * `setContext` / `useContext` / `snapshot` need no conversion. Only `context()`
 * casts, once, to attach the brand a `Symbol()` cannot carry on its own.
 */
export type ContextKey<T> = symbol & { readonly [__brand]: T };

export type ContextMap = Map<symbol, unknown>;

// Tries `globalThis.AsyncLocalStorage`, then `node:async_hooks`, falling back to
// `SyncContextStore` if neither exists. `run` is synchronous — it returns
// whatever the callback returns, unwrapped; `withScope` (async) is what flattens
// it, so this interface doesn't need an `as Promise<T>` to fake a type it never produces.

interface ContextStore {
  run<T>(ctx: ContextMap, fn: () => T): T;
  getStore(): ContextMap | undefined;
}

/** The shape of `AsyncLocalStorage` this depends on, nothing more. */
interface AsyncLocalStorageLike {
  run<T>(store: ContextMap, callback: () => T): T;
  getStore(): ContextMap | undefined;
}

type AsyncLocalStorageCtor = new () => AsyncLocalStorageLike;

/**
 * Synchronous fallback for runtimes with no `AsyncLocalStorage` — correct for
 * one scope at a time, but unable to tell a nested scope from a second
 * concurrent request, since both enter `run()` while the first `fn` is in
 * flight. It refuses the second case rather than returning the wrong value: a
 * render leaking another request's context is a cross-request data leak no
 * test would catch, while a named error is a one-line runtime config fix.
 *
 * @internal Exported for `context.test.ts` — `ensureStore` never reaches this
 * on a runtime that actually has `AsyncLocalStorage`.
 */
export class SyncContextStore implements ContextStore {
  #current: ContextMap | undefined;
  /** An async `fn` still in flight owns the current scope. */
  #pending = false;

  run<T>(ctx: ContextMap, fn: () => T): T {
    if (this.#pending) {
      throw new Error(
        "[vincle/core] withScope() was entered while another scope was still awaiting, " +
          "and this runtime has no AsyncLocalStorage to tell the two apart. " +
          "Enable it (Node ≥12.17, Bun, Deno ≥1.11, or Cloudflare Workers with " +
          "`nodejs_compat`) — concurrent renders cannot share a synchronous scope. " +
          "See https://vincle.cjean.fr/api/core/context",
      );
    }

    const previous = this.#current;
    this.#current = ctx;

    let result: T;
    try {
      result = fn();
    } catch (error) {
      this.#current = previous;
      throw error;
    }

    // A synchronous `fn` returns control here, closing the scope right away and
    // allowing nesting. An async `fn` keeps the scope installed until it
    // settles — otherwise `useContext` after the first `await` would see nothing.
    if (result instanceof Promise) {
      this.#pending = true;
      const settle = (): void => {
        this.#pending = false;
        this.#current = previous;
      };
      // Attached alongside rather than chained, so `fn`'s result passes through
      // untouched (no cast) and the caller stays the sole recipient of a rejection.
      result.then(settle, settle);
      return result;
    }

    this.#current = previous;
    return result;
  }

  getStore(): ContextMap | undefined {
    return this.#current;
  }
}

let contextStore: ContextStore | null = null;
let storeInit: Promise<void> | null = null;

async function ensureStore(): Promise<void> {
  if (contextStore) return;
  if (storeInit) return storeInit;

  storeInit = (async () => {
    const globalCtor = (globalThis as { AsyncLocalStorage?: AsyncLocalStorageCtor })
      .AsyncLocalStorage;
    if (globalCtor !== undefined) {
      contextStore = new globalCtor();
      return;
    }
    try {
      const { AsyncLocalStorage } = await import("node:async_hooks");
      contextStore = new AsyncLocalStorage<ContextMap>();
      return;
    } catch {
      /* No AsyncLocalStorage on this runtime — falls back below. */
    }
    warnSyncFallback();
    contextStore = new SyncContextStore();
  })();

  return storeInit;
}

/**
 * Never silent — the fallback changes a guarantee (isolation between concurrent
 * renders), which should surface at startup, not in production. Once per
 * process: a runtime property, not a per-render one.
 */
function warnSyncFallback(): void {
  console.warn(
    "[vincle/core] AsyncLocalStorage is not available on this runtime — " +
      "falling back to a synchronous context scope. One scope at a time works; " +
      "overlapping concurrent renders will throw rather than leak context between them. " +
      "See https://vincle.cjean.fr/api/core/context",
  );
}

function getStore(): ContextStore {
  if (!contextStore)
    throw new Error("[vincle/core] context store not initialized — call withScope first.");
  return contextStore;
}

/**
 * @internal Should only be used in tests — resets storage to force re-init.
 *
 * It deliberately leaves `namedContexts` alone: the tokens declared at module
 * level are already held in variables, and clearing the table would hand the
 * next `context("same-key")` a *different* symbol.
 */
export function resetContextStorage(): void {
  contextStore = null;
  storeInit = null;
}

/**
 * @internal Should only be used by the test that saturates the cap below.
 * `namedContexts` is process-wide, so a saturated table makes every later
 * `context()` call throw — in any package sharing the module instance.
 */
export function resetNamedContexts(): void {
  namedContexts.clear();
}

function scopeContext(caller: string): ContextMap {
  const ctx = contextStore?.getStore();
  if (!ctx) {
    throw new Error(
      `[vincle/core] ${caller}: no active context scope — context calls must run inside withScope(). ` +
        "Wrap the render in one: const html = await withScope(() => renderToString(<Page />));",
    );
  }
  return ctx;
}

/**
 * Human- and machine-readable name for a context key: the string it was
 * declared with (a symbol's description), or `Symbol()` when anonymous.
 */
function describeKey(key: symbol): string {
  const desc = (key as symbol).description;
  return desc !== undefined ? JSON.stringify(desc) : String(key);
}

// Memoized so `context(k) === context(k)`; the cap throws rather than silently
// breaking that identity once reached.
const namedContexts = new Map<string, symbol>();
const NAMED_CONTEXTS_MAX = 10_000;

/**
 * Declare a context key. Two calls with the same string give the same key, so
 * declare it once at module level and share the constant.
 *
 * @example
 * ```ts
 * import { context } from "@vincle/core";
 *
 * export const Theme = context<"light" | "dark">("app:theme");
 * ```
 *
 * @throws if 10 000 distinct keys are created — a key built per request leaks,
 *   since the table that keeps the identity never releases one.
 */
export function context<T>(globalKey: string): ContextKey<T> {
  if (typeof globalKey !== "string" || globalKey.length === 0) {
    throw new Error(
      `[vincle/core] context(): a non-empty string key is required, got ${JSON.stringify(globalKey as unknown)}. ` +
        'Declare the key once at module level: const Theme = context("app:theme");',
    );
  }
  let sym = namedContexts.get(globalKey);
  if (!sym) {
    if (namedContexts.size >= NAMED_CONTEXTS_MAX) {
      throw new Error(
        `[vincle/core] context(): ${NAMED_CONTEXTS_MAX} distinct keys have been created. ` +
          "Context keys are module-level constants, and the table that keeps " +
          "context(k) === context(k) never releases them — building a key per request " +
          "leaks. Declare the key once and pass the per-request value through setContext().",
      );
    }
    sym = Symbol(globalKey);
    namedContexts.set(globalKey, sym);
  }
  // The brand is phantom: no `Symbol()` carries it.
  return sym as ContextKey<T>;
}

/**
 * Set a value for the current scope. Visible to every component rendered below,
 * and to nothing outside the scope.
 *
 * @example
 * ```tsx
 * function Page() {
 *   setContext(Theme, "dark");
 *   return <Body />;
 * }
 * ```
 */
export function setContext<T>(key: ContextKey<T>, value: T): void {
  scopeContext("setContext").set(key, value);
}

/**
 * Read a value set earlier in the current scope.
 *
 * @example
 * ```tsx
 * const Body = () => <main class={useContext(Theme)}>…</main>;
 * ```
 *
 * @throws if the key was never set in this scope, or if there is no scope.
 */
export function useContext<T>(key: ContextKey<T>): T {
  const ctx = scopeContext("useContext");
  if (!ctx.has(key)) {
    throw new Error(
      `[vincle/core] useContext(${describeKey(key)}): the value was never set in the current scope. ` +
        "Set it above the reader with setContext(key, value) inside the same withScope() — " +
        "or check that the render actually runs in the scope that sets it.",
    );
  }
  return ctx.get(key) as T;
}

/**
 * Copy the current scope, to seed another one — a deferred fragment rendered
 * later still sees the values its page had.
 *
 * @example
 * ```ts
 * const parent = snapshot();
 * queueMicrotask(() => withScope(() => renderToString(<Fragment />), parent));
 * ```
 */
export function snapshot(): ContextMap {
  return new Map(scopeContext("snapshot"));
}

/**
 * Run `fn` in a fresh context scope. Required around any render that uses
 * `setContext` or `useContext`; concurrent scopes never see each other.
 *
 * @example
 * ```tsx
 * const html = await withScope(() => renderToString(<Page />));
 * ```
 */
export async function withScope<T>(fn: () => Awaitable<T>, parentCtx?: ContextMap): Promise<T> {
  await ensureStore();
  return getStore().run(new Map(parentCtx), fn);
}
