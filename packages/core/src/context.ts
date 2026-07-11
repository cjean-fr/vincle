import type { Awaitable } from "./render.js";

declare const __brand: unique symbol;

export interface ContextKey<T> {
  readonly [__brand]: T;
}

export type ContextMap = Map<ContextKey<unknown>, unknown>;

const namedContexts = new Map<string, symbol>();

function createFallbackStore(): {
  run<T>(ctx: ContextMap, fn: () => Awaitable<T>): Promise<T>;
  getStore(): ContextMap | undefined;
} {
  let fallback: ContextMap | undefined;
  return {
    run<T>(ctx: ContextMap, fn: () => Awaitable<T>): Promise<T> {
      const prev = fallback;
      fallback = ctx;
      const restore = () => { fallback = prev; };
      try {
        const result = fn();
        if (result instanceof Promise) return result.finally(restore);
        restore();
        return Promise.resolve(result);
      } catch (e) {
        restore();
        throw e;
      }
    },
    getStore: () => fallback,
  };
}

function createContextStore(): ReturnType<typeof createFallbackStore> {
  if (typeof (globalThis as any).AsyncLocalStorage !== "undefined") {
    return new (globalThis as any).AsyncLocalStorage();
  }
  try {
    const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
    return new AsyncLocalStorage<ContextMap>();
  } catch {
    console.warn(
      "[vincle/core] AsyncLocalStorage not available — using fallback store. " +
      "Concurrent requests may leak context between scopes. " +
      "Ensure your runtime provides AsyncLocalStorage (Node.js >= 22, modern Deno/Bun).",
    );
  }
  return createFallbackStore();
}

let contextStore = createContextStore();

/** @internal Should only be used in tests — resets AsyncLocalStorage state. */
export function resetContextStorage(forceFallback?: boolean): void {
  contextStore = forceFallback ? createFallbackStore() : createContextStore();
}

function scopeContext(): ContextMap {
  const ctx = contextStore.getStore();
  if (!ctx) {
    throw new Error(
      "[vincle/core] useContext/setContext — no active scope. Wrap your render in withScope(() => renderToString(...)).",
    );
  }
  return ctx;
}

export function context<T>(globalKey: string): ContextKey<T> {
  if (typeof globalKey !== "string" || globalKey.length === 0) {
    throw new Error(
      "[vincle/core] context(key): a non-empty string key is required.",
    );
  }
  let sym = namedContexts.get(globalKey);
  if (!sym) {
    sym = Symbol(globalKey);
    namedContexts.set(globalKey, sym);
  }
  return sym as unknown as ContextKey<T>;
}

export function setContext<T>(key: ContextKey<T>, value: T): void {
  scopeContext().set(key as ContextKey<unknown>, value);
}

export function useContext<T>(key: ContextKey<T>): T {
  const ctx = scopeContext();
  if (!ctx.has(key as ContextKey<unknown>)) {
    throw new Error(
      "[vincle/core] useContext() — context not found in current scope.",
    );
  }
  return ctx.get(key as ContextKey<unknown>) as T;
}

export function snapshot(): ContextMap {
  return new Map(scopeContext());
}

export function withScope<T>(
  fn: () => Awaitable<T>,
  parentCtx?: ContextMap,
): Promise<T> {
  return contextStore.run(new Map(parentCtx), fn);
}
