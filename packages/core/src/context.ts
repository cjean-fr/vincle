type Awaitable<T> = T | Promise<T>;

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
      const restore = () => {
        fallback = prev;
      };
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

// ── Context store (lazy init) ───────────────────────────────────────
// Le store est initialisé au premier appel de `withScope()` pour éviter
// tout `require()` ou import forcé d'AsyncLocalStorage au module level.
// - Si le runtime expose ALS globalement (Deno, Node ≥ 22 avec flag) → ALS
// - Sinon, tentative dynamic import de node:async_hooks (Bun, Node standard)
// - Sinon → fallback synchrone (store module-level, pas d'isolation async)
let contextStore: ReturnType<typeof createFallbackStore> | null = null;
let storeInit: Promise<void> | null = null;

async function ensureStore(): Promise<void> {
  if (contextStore) return;
  if (storeInit) return storeInit;

  storeInit = (async () => {
    if (typeof (globalThis as any).AsyncLocalStorage !== "undefined") {
      contextStore = new (globalThis as any).AsyncLocalStorage();
      return;
    }
    try {
      const { AsyncLocalStorage } = await import("node:async_hooks");
      contextStore = new AsyncLocalStorage<ContextMap>();
      return;
    } catch {
      /* ALS pas disponible — fallback */
    }
    console.warn(
      "[vincle/core] AsyncLocalStorage not available — using synchronous fallback. " +
        "Concurrent withScope() calls may leak context. See https://vincle.cjean.fr/docs/context#async-local-storage",
    );
    contextStore = createFallbackStore();
  })();

  return storeInit;
}

function getStore(): ReturnType<typeof createFallbackStore> {
  if (!contextStore) throw new Error("[vincle/core] context store not initialized — call withScope first.");
  return contextStore;
}

/**
 * @internal Should only be used in tests — resets storage to force re-init.
 * `forceFallback: true` installs the synchronous fallback store immediately,
 * bypassing auto-detection — used to exercise the fallback path on runtimes
 * (like Bun) where AsyncLocalStorage is otherwise always available.
 */
export function resetContextStorage(forceFallback?: boolean): void {
  contextStore = forceFallback ? createFallbackStore() : null;
  storeInit = forceFallback ? Promise.resolve() : null;
}

function scopeContext(): ContextMap {
  // Store pas encore initialisé → pas de scope actif. Même erreur que si
  // le scope existe pas, pour que les tests et les appelants aient un
  // message stable quel que soit l'ordre d'initialisation.
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
  return getStore().run(new Map(parentCtx), fn);
}
