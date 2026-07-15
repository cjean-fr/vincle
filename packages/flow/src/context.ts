import { context, setContext, useContext, withScope, type ContextKey } from "@vincle/core";

import type { FlowConfig } from "./types.js";

import { createAssetState, type AssetState } from "./assets.js";
import { createTemplateStore, type TemplateEntry, type TemplateStore } from "./template-store.js";

export type { FlowConfig } from "./types.js";

export interface FlowContext {
  config: FlowConfig;
  /** Internal template-content store. */
  templateStore: TemplateStore;
  /** Named asset state for `<Style name>` / `<Script name>` dedup. */
  assets: AssetState;

  nextId: () => string;
  /**
   * Register template content to render into the DOM element with this `id`.
   * Validates the id and that `merge` is supported by the active adapter.
   */
  registerTemplate(id: string, entry: TemplateEntry): void;
}

export const Flow: ContextKey<FlowContext> = context<FlowContext>("@vincle/flow:flow");

export function initFlow(config: FlowConfig): void {
  let counter = 0;
  const store = createTemplateStore(config);
  const assets = createAssetState();
  setContext(Flow, {
    config,
    templateStore: store,
    assets,
    nextId: () => `${config.idPrefix ?? "fragment-"}${++counter}`,
    registerTemplate(id, entry) {
      store.register(id, entry);
    },
  });
}

export function initFlowAssets(): void {
  const current = useContext(Flow);
  setContext(Flow, { ...current, assets: createAssetState() });
}

export function withFlow<T>(handler: (ctx: FlowContext) => T, config: FlowConfig): Promise<T> {
  return withScope(async function () {
    initFlow(config);
    return handler(useContext(Flow));
  });
}
