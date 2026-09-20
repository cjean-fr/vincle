import type { Awaitable } from "./types.js";

import { resolveAsyncLocalStorage } from "./als.js";
import {
  ERR_CONTEXT_KEY,
  ERR_CONTEXT_LIMIT,
  ERR_CONTEXT_UNSET,
  ERR_NO_SCOPE,
  ERR_NO_STORE,
  ERR_SCOPE_COLLISION,
  noAlsHint,
  vincleError,
} from "./errors.js";

declare const __brand: unique symbol;

/**
 * A context key. A `symbol` at runtime — the brand is phantom, and exists only
 * so `Scope.get(key)` knows what `key` was declared to hold.
 *
 * Intersecting with `symbol` rather than wrapping it is what removes the casts
 * at every call site: a `ScopeKey<T>` *is* a valid `ScopeMap` key, so
 * `Scope.set` / `Scope.get` / `Scope.snapshot` need no conversion. Only `Scope.key()`
 * casts, once, to attach the brand a `Symbol()` cannot carry on its own.
 */
export type ScopeKey<T> = symbol & { readonly [__brand]: T };

export type ScopeMap = Map<symbol, unknown>;

// Tries the runtime's `AsyncLocalStorage` (see `als.ts`), falling back to
// `SyncContextStore` if the runtime has none. `run` is synchronous — it returns
// whatever the callback returns, unwrapped; `Scope.with` (async) is what flattens
// it, so this interface doesn't need an `as Promise<T>` to fake a type it never produces.

interface ContextStore {
  run<T>(ctx: ScopeMap, fn: () => T): T;
  getStore(): ScopeMap | undefined;
}

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
  #current: ScopeMap | undefined;
  /** An async `fn` still in flight owns the current scope. */
  #pending = false;

  run<T>(ctx: ScopeMap, fn: () => T): T {
    if (this.#pending) {
      throw vincleError(
        "[vincle/core] Scope.with() was entered while another scope was still awaiting, " +
          "and this runtime has no AsyncLocalStorage to tell the two apart. " +
          noAlsHint("concurrent renders cannot share a synchronous scope"),
        ERR_SCOPE_COLLISION,
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
    // settles — otherwise `Scope.get` after the first `await` would see nothing.
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

  getStore(): ScopeMap | undefined {
    return this.#current;
  }
}

let contextStore: ContextStore | null = null;
let storeInit: Promise<void> | null = null;

async function ensureStore(): Promise<void> {
  if (contextStore) return;
  if (storeInit) return storeInit;

  storeInit = (async () => {
    const als = await resolveAsyncLocalStorage<ScopeMap>();
    if (als) {
      contextStore = als;
      return;
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
      "a second scope entered while one is still in flight will throw. " +
      "See https://vincle.cjean.fr/api/core/scope",
  );
}

function getStore(): ContextStore {
  if (!contextStore)
    throw vincleError(
      "[vincle/core] context store not initialized — call Scope.with first.",
      ERR_NO_STORE,
    );
  return contextStore;
}

/**
 * @internal Should only be used in tests — resets storage to force re-init.
 *
 * It deliberately leaves `namedContexts` alone: the tokens declared at module
 * level are already held in variables, and clearing the table would hand the
 * next `Scope.key("same-key")` a *different* symbol.
 */
export function resetContextStorage(): void {
  contextStore = null;
  storeInit = null;
}

/**
 * @internal Should only be used by the test that saturates the cap below.
 * `namedContexts` is process-wide, so a saturated table makes every later
 * `Scope.key()` call throw — in any package sharing the module instance.
 */
export function resetNamedContexts(): void {
  namedContexts.clear();
}

function scopeContext(caller: string): ScopeMap {
  const ctx = contextStore?.getStore();
  if (!ctx) {
    throw vincleError(
      `[vincle/core] ${caller}: no active context scope — context calls must run inside Scope.with(). ` +
        "Wrap the render in one: const html = await Scope.with(() => renderToString(<Page />));",
      ERR_NO_SCOPE,
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

// Memoized so `Scope.key(k) === Scope.key(k)`; the cap throws rather than silently
// breaking that identity once reached.
const namedContexts = new Map<string, symbol>();
const NAMED_CONTEXTS_MAX = 10_000;

/**
 * Declare a context key. Two calls with the same string give the same key, so
 * declare it once at module level and share the constant.
 *
 * @example
 * ```ts
 * import { Scope } from "@vincle/core";
 *
 * export const Theme = Scope.key<"light" | "dark">("app:theme");
 * ```
 *
 * @throws if 10 000 distinct keys are created — a key built per request leaks,
 *   since the table that keeps the identity never releases one.
 */
function contextKey<T>(globalKey: string): ScopeKey<T> {
  if (typeof globalKey !== "string" || globalKey.length === 0) {
    throw vincleError(
      `[vincle/core] Scope.key(): a non-empty string key is required, got ${JSON.stringify(globalKey as unknown)}. ` +
        'Declare the key once at module level: const Theme = Scope.key("app:theme");',
      ERR_CONTEXT_KEY,
    );
  }
  let sym = namedContexts.get(globalKey);
  if (!sym) {
    if (namedContexts.size >= NAMED_CONTEXTS_MAX) {
      throw vincleError(
        `[vincle/core] Scope.key(): ${NAMED_CONTEXTS_MAX} distinct keys have been created. ` +
          "Context keys are module-level constants, and the table that keeps " +
          "Scope.key(k) === Scope.key(k) never releases them — building a key per request " +
          "leaks. Declare the key once and pass the per-request value through Scope.set().",
        ERR_CONTEXT_LIMIT,
      );
    }
    sym = Symbol(globalKey);
    namedContexts.set(globalKey, sym);
  }
  // The brand is phantom: no `Symbol()` carries it.
  return sym as ScopeKey<T>;
}

/**
 * Set a value for the current scope. Visible to every component rendered below,
 * and to nothing outside the scope.
 *
 * @example
 * ```tsx
 * function Page() {
 *   Scope.set(Theme, "dark");
 *   return <Body />;
 * }
 * ```
 */
function setValue<T>(key: ScopeKey<T>, value: T): void {
  scopeContext("Scope.set").set(key, value);
}

/**
 * Read a value set earlier in the current scope.
 *
 * @example
 * ```tsx
 * const Body = () => <main class={Scope.get(Theme)}>…</main>;
 * ```
 *
 * @throws if the key was never set in this scope, or if there is no scope.
 */
function getValue<T>(key: ScopeKey<T>): T {
  const ctx = scopeContext("Scope.get");
  if (!ctx.has(key)) {
    throw vincleError(
      `[vincle/core] Scope.get(${describeKey(key)}): the value was never set in the current scope. ` +
        "Set it above the reader with Scope.set(key, value) inside the same Scope.with() — " +
        "or check that the render actually runs in the scope that sets it.",
      ERR_CONTEXT_UNSET,
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
 * const parent = Scope.snapshot();
 * queueMicrotask(() => Scope.with(() => renderToString(<Fragment />), parent));
 * ```
 */
function copyScope(): ScopeMap {
  return new Map(scopeContext("Scope.snapshot"));
}

/**
 * Run `fn` in a fresh scope. Required around any render that uses
 * `Scope.set` or `Scope.get`; concurrent scopes never see each other.
 *
 * @example
 * ```tsx
 * const html = await Scope.with(() => renderToString(<Page />));
 * ```
 */
async function runInScope<T>(fn: () => Awaitable<T>, seed?: ScopeMap): Promise<T> {
  // `await` on an already-resolved value still costs a microtask tick — paid
  // once, at process start, not on every render. `ensureStore` only awaits
  // anything the first time; once `contextStore` is set, this check is what
  // keeps every later call synchronous up to the actual `run()`.
  if (!contextStore) await ensureStore();
  return getStore().run(new Map(seed), fn);
}

/**
 * Per-execution state, independent of JSX Provider ancestry.
 *
 * A `Scope` value lives in the execution it was set in — visible to everything
 * rendered in the same `Scope.with()`, and to nothing outside it. Contrast with
 * the JSX Provider (`createContext` / `useContext`), whose value lives in the
 * tree: it follows the component ancestry, not the execution.
 */
export const Scope = {
  key: contextKey,
  set: setValue,
  get: getValue,
  with: runInScope,
  snapshot: copyScope,
} as const;
