import type { Awaitable } from "./types.js";

declare const __brand: unique symbol;

export interface ContextKey<T> {
  readonly [__brand]: T;
}

export type ContextMap = Map<ContextKey<unknown>, unknown>;

const namedContexts = new Map<string, symbol>();

// ── Context store interface ──────────────────────────────────────────
// L'interface isolant le code métier de l'implémentation ALS.
// `globalThis.AsyncLocalStorage` ou `node:async_hooks` sont tentés
// séquentiellement ; si aucun n'est disponible, une erreur est levée.
// Tous les runtimes serveur modernes supportent ALS (Node ≥12.17, Bun, Deno ≥1.11).

interface ContextStore {
  run<T>(ctx: ContextMap, fn: () => Awaitable<T>): Promise<T>;
  getStore(): ContextMap | undefined;
}

let contextStore: ContextStore | null = null;
let storeInit: Promise<void> | null = null;

/** Wrap a runtime ALS into our `ContextStore` interface. */
function wrapALS(als: {
  run<R>(store: ContextMap, callback: () => R): Promise<R>;
  getStore(): ContextMap | undefined;
}): ContextStore {
  return {
    run: (ctx, fn) => als.run(ctx, fn) as Promise<unknown> as Promise<any>,
    getStore: () => als.getStore(),
  };
}

async function ensureStore(): Promise<void> {
  if (contextStore) return;
  if (storeInit) return storeInit;

  storeInit = (async () => {
    if (typeof (globalThis as any).AsyncLocalStorage !== "undefined") {
      contextStore = wrapALS(new (globalThis as any).AsyncLocalStorage());
      return;
    }
    try {
      const { AsyncLocalStorage } = await import("node:async_hooks");
      contextStore = wrapALS(new AsyncLocalStorage<ContextMap>());
      return;
    } catch {
      /* ALS pas disponible */
    }
    throw new Error(
      "[vincle/core] AsyncLocalStorage not available. " +
        "Use Node ≥12.17, Bun, or Deno ≥1.11. " +
        "See https://vincle.cjean.fr/api/core/context",
    );
  })();

  return storeInit;
}

function getStore(): ContextStore {
  if (!contextStore)
    throw new Error("[vincle/core] context store not initialized — call withScope first.");
  return contextStore;
}

/**
 * @internal Should only be used in tests — resets storage to force re-init.
 */
export function resetContextStorage(): void {
  contextStore = null;
  storeInit = null;
}

function scopeContext(): ContextMap {
  const ctx = contextStore?.getStore();
  if (!ctx) {
    throw new Error(
      "[vincle/core] useContext/setContext — no active scope. Wrap your render in withScope(() => renderToString(...)).",
    );
  }
  return ctx;
}

export function context<T>(globalKey: string): ContextKey<T> {
  if (typeof globalKey !== "string" || globalKey.length === 0) {
    throw new Error("[vincle/core] context(key): a non-empty string key is required.");
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
    throw new Error("[vincle/core] useContext() — context not found in current scope.");
  }
  return ctx.get(key as ContextKey<unknown>) as T;
}

export function snapshot(): ContextMap {
  return new Map(scopeContext());
}

export async function withScope<T>(fn: () => Awaitable<T>, parentCtx?: ContextMap): Promise<T> {
  await ensureStore();
  // ALS.run renvoie Promise<R> où R est le type de retour du callback.
  // fn retourne `Awaitable<T>` (= T | Promise<T>), donc TypeScript voit
  // `Promise<T | Promise<T>>`. À l'exécution JS aplatit le Promise imbriqué,
  // donc le cast est sûr.
  return getStore().run(new Map(parentCtx), fn) as Promise<T>;
}
