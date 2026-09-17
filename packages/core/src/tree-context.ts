import type { Renderable } from "./types.js";

import { ERR_SCOPE_COLLISION, ERR_TREE_ASYNC, vincleError } from "./errors.js";

interface Frame {
  readonly context: Context<unknown>;
  readonly value: unknown;
  readonly parent: Frame | undefined;
}

interface Store {
  run<T>(frame: Frame, callback: () => T): T;
  getStore(): Frame | undefined;
}

/** Synchronous fallback when the runtime has no AsyncLocalStorage. */
export class SyncTreeStore implements Store {
  #current: Frame | undefined;

  getStore(): Frame | undefined {
    return this.#current;
  }

  run<T>(frame: Frame, callback: () => T): T {
    if (this.#current && frame.parent !== this.#current)
      throw vincleError(
        "[vincle/core] concurrent Providers require AsyncLocalStorage",
        ERR_SCOPE_COLLISION,
      );
    const previous = this.#current;
    this.#current = frame;
    try {
      const result = callback();
      if (result instanceof Promise) {
        void result.catch(() => {});
        throw vincleError(
          "[vincle/core] async Providers require AsyncLocalStorage",
          ERR_TREE_ASYNC,
        );
      }
      return result;
    } finally {
      this.#current = previous;
    }
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
      console.warn(
        "[vincle/core] AsyncLocalStorage unavailable; tree context supports one synchronous render at a time.",
      );
      return (store = new SyncTreeStore());
    }
  })());
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
export function snapshotTreeContext(): <T>(render: () => T) => T {
  const frame = store?.getStore();
  const capturedStore = store;
  return <T>(render: () => T): T =>
    frame && capturedStore ? capturedStore.run(frame, render) : render();
}
