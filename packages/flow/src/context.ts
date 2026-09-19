import { Scope, type ScopeKey, type JSX } from "@vincle/core";

import type { FlowConfig } from "./types.js";

import { createAssetState, createSuppressedAssetState, type AssetState } from "./assets.js";
import { assertFlowConfig, PREFIX } from "./config.js";
import { ERR_FLOW_NO_ADAPTER, vincleError } from "./errors.js";
import { createFragmentStore, type FragmentEntry, type FragmentStore } from "./fragment-store.js";

export type { FlowConfig } from "./types.js";

export interface FlowContext {
  config: FlowConfig;
  /** Internal fragment-content store. */
  fragments: FragmentStore;
  /** Named asset state for `<Style name>` / `<Script name>` dedup. */
  assets: AssetState;

  nextId: () => string;
  /**
   * Register fragment content to render into the DOM element with this `id`.
   * Validates the id and that `merge` is supported by the active adapter.
   * Throws when the id is already registered — one target per render.
   */
  registerFragment(id: string, entry: FragmentEntry): void;
}

export const Flow: ScopeKey<FlowContext> = Scope.key<FlowContext>("@vincle/flow:flow");

/**
 * The single adapter negotiation for deferred-fragment placeholders. Defer,
 * Slot and Include all end in `adapter.Placeholder({ id, src, children })`;
 * only their *policies* differ (what to register, which URL to allow, whether
 * a missing adapter is an error). Everything about the negotiation lives here:
 *
 * - a missing adapter is an error (callers that want to tolerate it, e.g.
 *   Defer in pure-static mode, check `config.adapter` themselves first);
 * - in static mode `src` defaults to `generatePath(id)`; callers that carry
 *   their own URL (Include) pass it explicitly;
 * - children are normalized to `null`.
 */
export function renderPlaceholder(
  id: string,
  children?: JSX.Element | null,
  src?: string,
): JSX.Element {
  const { config } = Scope.get(Flow);
  if (!config.adapter) {
    throw vincleError(
      `${PREFIX} renderPlaceholder("${id}"): no adapter configured — a placeholder needs an adapter ` +
        "to emit its deferred-fragment markup. Pass { adapter: ... } to renderToStatic, " +
        "or render through renderToStream() with an adapter.",
      ERR_FLOW_NO_ADAPTER,
    );
  }
  const resolvedSrc = src ?? (config.mode === "static" ? config.generatePath(id) : null);
  return config.adapter.Placeholder({ id, src: resolvedSrc, children: children ?? null });
}

export function initFlow(config: FlowConfig): void {
  // The funnel for every flow entry point: a wrong config stops here, at setup.
  assertFlowConfig(config);
  let counter = 0;
  const store = createFragmentStore(config);
  const assets = createAssetState();
  Scope.set(Flow, {
    config,
    fragments: store,
    assets,
    nextId: () => `${config.idPrefix ?? "fragment-"}${++counter}`,
    registerFragment(id, entry) {
      store.register(id, entry);
    },
  });
}

/**
 * Give the current scope its own asset state — a page boundary.
 *
 * A new context object, not a mutation of the existing one: two `renderPage`
 * calls awaited together each get their own scope, and mutating the shared
 * object made them race on `.assets`.
 */
export function initFlowAssets(): void {
  const current = Scope.get(Flow);
  Scope.set(Flow, { ...current, assets: createAssetState() });
}

/**
 * Give the current scope an asset state that emits nothing — used for standalone
 * fragment files, whose assets belong to the shell that includes them.
 */
export function suppressFlowAssets(): void {
  const current = Scope.get(Flow);
  Scope.set(Flow, { ...current, assets: createSuppressedAssetState() });
}

export function withFlow<T>(handler: (ctx: FlowContext) => T, config: FlowConfig): Promise<T> {
  return Scope.with(async function () {
    initFlow(config);
    return handler(Scope.get(Flow));
  });
}
