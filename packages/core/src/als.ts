/**
 * Shared `AsyncLocalStorage` detection for `scope` and `provider`: the two
 * subsystems that need per-async-context state, each with its own store type
 * and its own synchronous fallback.
 *
 * Resolves the runtime's `AsyncLocalStorage`: `globalThis.AsyncLocalStorage`
 * first (Node's global, Deno, Bun, Cloudflare with node compat), then
 * `node:async_hooks` (Node). Returns an instance typed with the caller's own
 * store type, or `undefined` when the runtime has neither: the synchronous
 * fallback, and the warning about the guarantee it degrades, stay with the
 * caller, since that guarantee differs per consumer.
 *
 * @internal
 */

/** The shape of `AsyncLocalStorage` the consumers depend on, nothing more. */
export interface AsyncLocalStorageLike<T> {
  run<R>(store: T, callback: () => R): R;
  getStore(): T | undefined;
}

export async function resolveAsyncLocalStorage<T>(): Promise<AsyncLocalStorageLike<T> | undefined> {
  const globalCtor = (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage;
  if (typeof globalCtor === "function") {
    return new (globalCtor as new () => AsyncLocalStorageLike<T>)();
  }
  try {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    return new AsyncLocalStorage<T>();
  } catch {
    return undefined;
  }
}
