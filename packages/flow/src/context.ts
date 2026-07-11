import { createAssetState, type AssetState } from "./assets.js";
import type { FlowConfig } from "./types.js";
import {
  createPendingStore,
  type Pending,
  type PendingStore,
} from "./pending-store.js";
import {
  context,
  setContext,
  useContext,
  withScope,
  type ContextKey,
} from "@vincle/core";

export type { FlowConfig } from "./types.js";

export interface FlowContext {
  config: FlowConfig;
  /** Internal deferred-work store. */
  pendingStore: PendingStore;
  /** Named asset state for `<Style name>` / `<Script name>` dedup. */
  assets: AssetState;

  nextId: () => string;
  /**
   * Register deferred work to render into the DOM element with this `id`.
   * Validates the id and that `merge` is supported by the active adapter.
   */
  defer(id: string, entry: Pending): void;
}

export const Flow: ContextKey<FlowContext> =
  context<FlowContext>("@vincle/flow:flow");

export function initFlow(config: FlowConfig): void {
  let counter = 0;
  const store = createPendingStore(config);
  const assets = createAssetState();
  setContext(Flow, {
    config,
    pendingStore: store,
    assets,
    nextId: () => `${config.idPrefix ?? "fragment-"}${++counter}`,
    defer(id, entry) {
      store.defer(id, entry);
    },
  });
}

export function initFlowAssets(): void {
  // Replace the Flow context entry in THIS scope with a copy that has a fresh
  // asset state — never mutate the shared context object in place. `withScope`
  // gives each child scope its own context map, so `setContext` here is
  // scope-local: parallel `renderPage` calls (Promise.all in an SSG build) get
  // independent asset states instead of racing on one shared `.assets`.
  const current = useContext(Flow);
  setContext(Flow, { ...current, assets: createAssetState() });
}

export function withFlow<T>(
  handler: (ctx: FlowContext) => T,
  config: FlowConfig,
): Promise<T> {
  return withScope(async function () {
    initFlow(config);
    return handler(useContext(Flow));
  });
}
