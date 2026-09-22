import type { Renderable } from "./types.js";

import { resolveAsyncLocalStorage } from "./als.js";
import { ERR_CONTEXT_CHILDREN, ERR_SCOPE_COLLISION, noAlsHint, vincleError } from "./errors.js";

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
 * Synchronous fallback for runtimes with no `AsyncLocalStorage` - correct for
 * one render at a time, but unable to tell a second concurrent render from the
 * one it serves, since both enter `run()` while the first is still in flight.
 * It refuses the second case rather than returning the wrong value: a render
 * leaking another request's context is a cross-request data leak no test would
 * catch, while a named error is a one-line runtime config fix.
 *
 * @internal Exported for `provider.test.tsx` - `initialize` never reaches this
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
    // An async one keeps the frame installed until it settles - otherwise
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

export interface ContextProvider<T> {
  (props: { value: T; children?: any }): any;
}

export interface Context<T> extends ContextProvider<T> {
  /** The provider - the context itself, as in React 19 (`ctx.Provider === ctx`). */
  readonly Provider: ContextProvider<T>;
  readonly Consumer: (props: { children: (value: T) => any }) => any;
  /** @internal A React context has the same surface but cannot be rendered by vincle. */
  readonly [defaultValueKey]: T;
}

export const providerMarker = Symbol("vincle.provider");
/** The default, kept out of the public surface - React 19's context object does not expose it. */
const defaultValueKey = Symbol("vincle.context.default");
let store: Store | undefined;
let initializing: Promise<Store> | undefined;

function initialize(): Promise<Store> {
  return (initializing ??= (async () => {
    const als = await resolveAsyncLocalStorage<Frame>();
    if (als) return (store = als);
    warnSyncTreeFallback();
    return (store = new SyncTreeStore());
  })());
}

/**
 * Never silent - the fallback changes a guarantee (isolation between concurrent
 * renders), which should surface at startup, not in production. Once per
 * process: a runtime property, not a per-render one.
 */
function warnSyncTreeFallback(): void {
  console.warn(
    "[vincle/core] AsyncLocalStorage is not available on this runtime - " +
      "falling back to a synchronous tree context. One render at a time works, " +
      "even async; a Provider entered while another render is still in flight " +
      "will throw. See https://vincle.cjean.fr/api/core/scope",
  );
}

/**
 * A tree context, tracking React 19's modern surface: the context object is the
 * provider - `<MyContext value>` and `<MyContext.Provider value>` are the same
 * element because `MyContext.Provider === MyContext` - and `MyContext.Consumer`
 * is the render-prop reader. The declared default is not part of the surface
 * (React 19 removed the mutable `defaultValue` property); it is captured at
 * creation and read by `useContext` when no Provider matches.
 *
 * The private default-value key also brands the type: React contexts share the
 * visible surface, but vincle's renderer cannot read or provide their values.
 */
export function createContext<T>(defaultValue: T): Context<T> {
  // The value is read from the element's attrs by the tree walk, never here,
  // this body only keeps the context callable.
  function Provider(props: { value: T; children?: Renderable }): Renderable {
    return props.children;
  }
  function Consumer(props: { children: (value: T) => Renderable }): Renderable {
    if (typeof props.children !== "function") {
      throw vincleError(
        "[vincle/core] a Consumer was given a children prop that is not a function. " +
          "Pass one function of the value: <MyContext.Consumer>{(value) => ...}</MyContext.Consumer>.",
        ERR_CONTEXT_CHILDREN,
      );
    }
    return props.children(useContext(context));
  }
  const context = Provider as Context<T>;
  Object.assign(context, { Provider: context, Consumer });
  Object.defineProperty(context, providerMarker, { value: context });
  Object.defineProperty(context, defaultValueKey, { value: defaultValue });
  return context;
}

export function useContext<T>(context: Context<T>): T {
  for (let frame = store?.getStore(); frame; frame = frame.parent) {
    if (frame.context === context) return frame.value as T;
  }
  return context[defaultValueKey];
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
