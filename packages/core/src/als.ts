import { ERR_SCOPE_COLLISION, vincleError } from "./errors.js";

/**
 * Shared `AsyncLocalStorage` detection for `scope` and `provider`: the two
 * subsystems that need per-async-context state, each with its own store type.
 *
 * Resolves the runtime's `AsyncLocalStorage`: `globalThis.AsyncLocalStorage`
 * first (Node's global, Deno, Bun, Cloudflare with node compat), then
 * `node:async_hooks` (Node). Returns an instance typed with the caller's own
 * store type, or `undefined` when the runtime has neither: the caller then
 * falls back to `SyncStore`, and keeps the warning about the guarantee it
 * degrades, since that guarantee differs per consumer.
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

/**
 * Synchronous fallback for runtimes with no `AsyncLocalStorage`: correct for
 * one render at a time, but unable to tell a nested `run()` from a second
 * concurrent render, since both enter while the first `fn` is in flight. It
 * refuses the second case rather than returning the wrong value: a render
 * leaking another request's state is a cross-request data leak no test would
 * catch, while a named error is a one-line runtime config fix.
 */
export class SyncStore<T> implements AsyncLocalStorageLike<T> {
  #current: T | undefined;
  /** An async `fn` still in flight owns the current store. */
  #pending = false;
  readonly #collision: string;

  /** `collision`: the message thrown when a second render enters mid-flight. */
  constructor(collision: string) {
    this.#collision = collision;
  }

  run<R>(store: T, fn: () => R): R {
    if (this.#pending) throw vincleError(this.#collision, ERR_SCOPE_COLLISION);

    const previous = this.#current;
    this.#current = store;

    let result: R;
    try {
      result = fn();
    } catch (error) {
      this.#current = previous;
      throw error;
    }

    // A synchronous `fn` closes its store right away, so nesting works. An
    // async one keeps it installed until it settles: otherwise a read after
    // the first `await` would see nothing.
    if (result instanceof Promise) {
      this.#pending = true;
      const settle = (): void => {
        this.#pending = false;
        this.#current = previous;
      };
      // Attached alongside rather than chained, so `fn`'s result passes through
      // untouched and the caller stays the sole recipient of a rejection.
      result.then(settle, settle);
      return result;
    }

    this.#current = previous;
    return result;
  }

  getStore(): T | undefined {
    return this.#current;
  }
}
