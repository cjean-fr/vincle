import type { Awaitable } from "./types.js";

// TC39 Async Context proposal (Stage 2, 2025-09)
// https://github.com/tc39/proposal-async-context
// When native (≈ ES2028+), replace AsyncLocalStorage with:
//   const _store = new AsyncContext.Variable<ContextMap>();
//   storage.getStore() → _store.get()
//   storage.run(m, fn) → _store.run(m, fn)
// All other exports (context, setContext, useContext, withScope, snapshot)
// keep their signatures unchanged.

declare const __brand: unique symbol;

export interface ContextKey<T> {
  readonly [__brand]: T;
}

export interface ScopeOptions {
  seed?: Map<ContextKey<unknown>, unknown>;
}

export type ContextMap = Map<ContextKey<unknown>, unknown>;

interface ScopeStorage {
  run<T>(store: ContextMap, fn: () => T): Promise<T>;
  getStore(): ContextMap | undefined;
}

let storage: ScopeStorage | undefined;
let storagePromise: Promise<ScopeStorage> | undefined;

async function ensureStorage(): Promise<ScopeStorage> {
  if (storage) return storage;
  if (storagePromise) return storagePromise;
  storagePromise = (async () => {
    const mod = await import("node:async_hooks");
    const { AsyncLocalStorage } = mod;
    const als = new AsyncLocalStorage<ContextMap>();
    storage = {
      run<T>(store: ContextMap, fn: () => T): Promise<T> {
        return als.run(store, fn) as Promise<T>;
      },
      getStore(): ContextMap | undefined {
        return als.getStore();
      },
    };
    return storage;
  })();
  return storagePromise;
}

const namedContexts = new Map<string, symbol>();

export function context<T>(globalKey: string): ContextKey<T> {
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
  return sym as unknown as ContextKey<T>;
}

export function setContext<T>(ctx: ContextKey<T>, value: T): void {
  const map = storage?.getStore();
  if (!map) {
    throw new Error(
      "[vincle/core] setContext() called outside of a withScope() scope.",
    );
  }
  map.set(ctx as ContextKey<unknown>, value);
}

export function useContext<T>(ctx: ContextKey<T>): T {
  const map = storage?.getStore();
  if (!map) {
    throw new Error(
      "[vincle/core] useContext() called outside of a withScope() scope.",
    );
  }
  if (!map.has(ctx as ContextKey<unknown>)) {
    throw new Error(
      "[vincle/core] useContext() — context not found in current scope. Did you call setContext() in this withScope?",
    );
  }
  return map.get(ctx as ContextKey<unknown>) as T;
}

export async function withScope<T>(
  fn: () => Awaitable<T>,
  options?: ScopeOptions,
): Promise<T> {
  const als = await ensureStorage();
  return als.run(new Map(options?.seed), fn);
}

export function snapshot(): Map<ContextKey<unknown>, unknown> {
  const map = storage?.getStore();
  if (!map) {
    throw new Error(
      "[vincle/core] snapshot() called outside of a withScope() scope.",
    );
  }
  return new Map(map);
}

/**
 * @internal Get the current scope's context map, or undefined if no scope is active.
 * Unlike `snapshot()` this does not throw — callers can decide how to handle absence.
 */
export function getCurrentScopeMap(): ContextMap | undefined {
  return storage?.getStore();
}

/** @internal Reset module-level state for test isolation. */
export function resetContextStorage(): void {
  storage = undefined;
  storagePromise = undefined;
  namedContexts.clear();
}
