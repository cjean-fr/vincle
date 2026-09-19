import type { Renderable } from "./types.js";

import { ERR_SCOPE_COLLISION, noAlsHint, vincleError } from "./errors.js";

interface Frame {
  readonly context: Context<unknown>;
  readonly value: unknown;
  readonly parent: Frame | undefined;
}

interface Store {
  run<T>(frame: Frame, callback: () => T): T;
  getStore(): Frame | undefined;
}

/**
 * Synchronous fallback for runtimes with no `AsyncLocalStorage` — correct for
 * one render at a time, but unable to tell a second concurrent render from the
 * one it serves, since both enter `run()` while the first is still in flight.
 * It refuses the second case rather than returning the wrong value: a render
 * leaking another request's context is a cross-request data leak no test would
 * catch, while a named error is a one-line runtime config fix.
 *
 * @internal Exported for `provider.test.tsx` — `initialize` never reaches this
 * on a runtime that actually has `AsyncLocalStorage`.
 */
export class SyncTreeStore implements Store {
  #current: Frame | undefined;
  /** An async render still in flight owns the current frame. */
  #pending = false;

  getStore(): Frame | undefined {
    return this.#current;
  }

  run<T>(frame: Frame, callback: () => T): T {
    if (this.#pending) {
      throw vincleError(
        "[vincle/core] a Provider was entered while another render was still awaiting, " +
          "and this runtime has no AsyncLocalStorage to tell the two apart. " +
          noAlsHint("concurrent renders cannot share a synchronous tree"),
        ERR_SCOPE_COLLISION,
      );
    }

    const previous = this.#current;
    this.#current = frame;

    let result: T;
    try {
      result = callback();
    } catch (error) {
      this.#current = previous;
      throw error;
    }

    // A synchronous callback closes its frame right away, so nesting works.
    // An async one keeps the frame installed until it settles — otherwise
    // `useContext` after the first `await` would see nothing.
    if (result instanceof Promise) {
      this.#pending = true;
      const settle = (): void => {
        this.#pending = false;
        this.#current = previous;
      };
      // Attached alongside rather than chained, so `callback`'s result passes
      // through untouched and the caller stays the sole recipient of a rejection.
      result.then(settle, settle);
      return result;
    }

    this.#current = previous;
    return result;
  }
}

export interface Context<T> {
  readonly Provider: (props: { value: T; children?: Renderable }) => Renderable;
  readonly defaultValue: T;
}

export const providerMarker = Symbol("vincle.provider");
let store: Store | undefined;
let initializing: Promise<Store> | undefined;

function initialize(): Promise<Store> {
  return (initializing ??= (async () => {
    const globalCtor = (globalThis as { AsyncLocalStorage?: new () => Store }).AsyncLocalStorage;
    if (globalCtor) return (store = new globalCtor());
    try {
      const { AsyncLocalStorage } = await import("node:async_hooks");
      return (store = new AsyncLocalStorage<Frame>());
    } catch {
      warnSyncTreeFallback();
      return (store = new SyncTreeStore());
    }
  })());
}

/**
 * Never silent — the fallback changes a guarantee (isolation between concurrent
 * renders), which should surface at startup, not in production. Once per
 * process: a runtime property, not a per-render one.
 */
function warnSyncTreeFallback(): void {
  console.warn(
    "[vincle/core] AsyncLocalStorage is not available on this runtime — " +
      "falling back to a synchronous tree context. One render at a time works, " +
      "even async; a Provider entered while another render is still in flight " +
      "will throw. See https://vincle.cjean.fr/api/core/scope",
  );
}

export function createContext<T>(defaultValue: T): Context<T> {
  const Provider = ({ children }: { value: T; children?: Renderable }): Renderable => children;
  const context: Context<T> = { Provider, defaultValue };
  Object.defineProperty(Provider, providerMarker, { value: context });
  return context;
}

export function useContext<T>(context: Context<T>): T {
  for (let frame = store?.getStore(); frame; frame = frame.parent) {
    if (frame.context === context) return frame.value as T;
  }
  return context.defaultValue;
}

export function renderProvider<T>(
  context: Context<T>,
  value: T,
  render: () => string | Promise<string>,
): string | Promise<string> {
  if (!store) return initialize().then(() => renderProvider(context, value, render));
  return store.run(
    { context: context as Context<unknown>, value, parent: store.getStore() },
    render,
  );
}

/** Capture the active tree frame for deferred work that executes later. */
export function snapshotContext(): <T>(render: () => T) => T {
  const frame = store?.getStore();
  const capturedStore = store;
  return <T>(render: () => T): T =>
    frame && capturedStore ? capturedStore.run(frame, render) : render();
}
