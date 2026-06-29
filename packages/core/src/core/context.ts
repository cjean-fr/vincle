import type { AsyncLocalStorage } from "node:async_hooks";
import type { Awaitable } from "./types.js";

// TC39 Async Context proposal (Stage 2, 2025-09)
// https://github.com/tc39/proposal-async-context
// When native (≈ ES2028+), replace AsyncLocalStorage with:
//   const _store = new AsyncContext.Variable<ScopeMap>();
//   storage.getStore() → _store.get()
//   storage.run(m, fn) → _store.run(m, fn)
// All other exports (context, setContext, useContext, withScope, snapshot)
// keep their signatures unchanged.

declare const __brand: unique symbol;

export interface Context<T> {
  readonly [__brand]: T;
}

export interface ScopeOptions {
  seed?: Map<Context<unknown>, unknown>;
}

type ScopeMap = Map<Context<unknown>, unknown>;

// Lazy — deferred to first withScope() call so runtimes without
// node:async_hooks (Workers, Deno, browser) can still import the package.
let storage: AsyncLocalStorage<ScopeMap> | undefined;
let storagePromise: Promise<AsyncLocalStorage<ScopeMap>> | undefined;

async function ensureStorage(): Promise<AsyncLocalStorage<ScopeMap>> {
  if (storage) return storage;
  if (storagePromise) return storagePromise;
  storagePromise = (async () => {
    try {
      const mod = await import("node:async_hooks");
      storage = new mod.AsyncLocalStorage<ScopeMap>();
      return storage;
    } catch (cause) {
      storagePromise = undefined;
      throw cause;
    }
  })();
  return storagePromise;
}

const namedContexts = new Map<string, symbol>();

export function context<T>(globalKey: string): Context<T> {
  if (typeof globalKey !== "string" || globalKey.length === 0) {
    throw new Error(
      "[vincle/core] context(key): a non-empty string key is required. " +
        'Use a namespaced form like `context<T>("@my-org/my-pkg:purpose")`.',
    );
  }
  let sym = namedContexts.get(globalKey);
  if (!sym) {
    sym = Symbol(globalKey);
    namedContexts.set(globalKey, sym);
  }
  return sym as unknown as Context<T>;
}

export function setContext<T>(ctx: Context<T>, value: T): void {
  const map = storage?.getStore();
  if (!map) {
    throw new Error(
      "[vincle/core] setContext() called outside of a withScope() scope.",
    );
  }
  map.set(ctx as Context<unknown>, value);
}

export function useContext<T>(ctx: Context<T>): T {
  const map = storage?.getStore();
  if (!map) {
    throw new Error(
      "[vincle/core] useContext() called outside of a withScope() scope.",
    );
  }
  if (!map.has(ctx as Context<unknown>)) {
    throw new Error(
      "[vincle/core] useContext() — context not found in current scope. Did you call setContext() in this withScope?",
    );
  }
  return map.get(ctx as Context<unknown>) as T;
}

export async function withScope<T>(
  fn: () => Awaitable<T>,
  options?: ScopeOptions,
): Promise<T> {
  const als = await ensureStorage();
  return als.run(new Map(options?.seed), fn);
}

export function snapshot(): Map<Context<unknown>, unknown> {
  const map = storage?.getStore();
  if (!map) {
    throw new Error(
      "[vincle/core] snapshot() called outside of a withScope() scope.",
    );
  }
  return new Map(map);
}

/** @internal Reset module-level state for test isolation. */
export function resetContextStorage(): void {
  storage = undefined;
  storagePromise = undefined;
  namedContexts.clear();
}
