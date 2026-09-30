import { Scope, renderToString, type JSX, type ScopeKey } from "@vincle/core";

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
  /** The page's `<Slot>` names, and the mark around a placeholder one may replace. */
  slots: SlotState;

  nextId: () => string;
  /**
   * Register fragment content to render into the DOM element with this `id`.
   * Validates the id and that `merge` is supported by the active adapter.
   * Throws when the id is already registered: one target per render.
   */
  registerFragment(id: string, entry: FragmentEntry): void;
}

export const Flow: ScopeKey<FlowContext> = Scope.key<FlowContext>("@vincle/flow:flow");

/**
 * The single adapter negotiation for deferred-fragment placeholders. Defer
 * and Slot both end in `adapter.Placeholder({ id, src, children })`;
 * only their *policies* differ (what to register, whether a missing adapter
 * is an error). Everything about the negotiation lives here:
 *
 * - a missing adapter is an error (callers that want to tolerate it, e.g.
 *   Defer in pure-static mode, check `config.adapter` themselves first);
 * - in static mode `src` defaults to `generatePath(id)`;
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
      `${PREFIX} renderPlaceholder("${id}"): no adapter configured: a placeholder needs an adapter ` +
        "to emit its deferred-fragment markup. Pass { adapter: ... } to renderToStatic, " +
        "or render through renderToStream() with an adapter.",
      ERR_FLOW_NO_ADAPTER,
    );
  }
  const resolvedSrc = src ?? (config.mode === "static" ? config.generatePath(id) : null);
  return config.adapter.Placeholder({ id, src: resolvedSrc, children: children ?? null });
}

/**
 * A `<Defer>` whose target names a `<Slot>` has no placeholder of its own: the
 * slot is it. One rendered earlier is known at once. One rendered later is not,
 * so the `<Defer>` marks its placeholder, and `renderFlow` drops it once the page
 * is rendered if a slot of that name turned up.
 */
export interface SlotState {
  readonly names: Set<string>;
  /** Random per page, so no markup the author writes can match it. */
  mark: string | undefined;
}

const createSlotState = (): SlotState => ({ names: new Set(), mark: undefined });

const MARK_PREFIX = "<!--vincle-defer-";

/** The comment pair around the placeholder of a `<Defer>` whose slot may come later. */
export function pendingMarks(slots: SlotState, id: string): [string, string] {
  slots.mark ??= `vincle-defer-${crypto.randomUUID()}`;
  return [`<!--${slots.mark}:${id}-->`, `<!--/${slots.mark}:${id}-->`];
}

/**
 * Render a tree that may hold flow components, and settle every marked
 * placeholder: dropped when a slot of its id was rendered, unwrapped otherwise.
 * Ids are unique per render, so each open mark has one close mark.
 */
export async function renderFlow(node: Parameters<typeof renderToString>[0]): Promise<string> {
  const html = await renderToString(node);
  // Checked before the scope is read: a render with no flow scope has no marks.
  if (!html.includes(MARK_PREFIX)) return html;
  const { slots } = Scope.get(Flow);
  const open = `<!--${slots.mark}:`;
  const parts: string[] = [];
  const closings: Array<{ start: number; end: number }> = [];
  let from = 0;
  let start = html.indexOf(open, from);
  for (;;) {
    const closing = closings.at(-1);
    if (closing && (start === -1 || start >= closing.start)) {
      parts.push(html.slice(from, closing.start));
      from = closing.end;
      closings.pop();
      continue;
    }
    if (start === -1) break;
    const idEnd = html.indexOf("-->", start);
    const id = html.slice(start + open.length, idEnd);
    const close = `<!--/${slots.mark}:${id}-->`;
    const end = html.indexOf(close, idEnd);
    if (end === -1) break;
    parts.push(html.slice(from, start));
    if (slots.names.has(id)) {
      from = end + close.length;
    } else {
      // Keep walking retained fallback content: it can contain another Defer.
      closings.push({ start: end, end: end + close.length });
      from = idEnd + 3;
    }
    start = html.indexOf(open, from);
  }
  if (from === 0) return html;
  parts.push(html.slice(from));
  return parts.join("");
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
    slots: createSlotState(),
    nextId: () => `${config.idPrefix ?? "fragment-"}${++counter}`,
    registerFragment(id, entry) {
      store.register(id, entry);
    },
  });
}

/**
 * Give the current scope its own asset state and slot names: a page boundary.
 *
 * A new context object, not a mutation of the existing one: two `renderPage`
 * calls awaited together each get their own scope, and a shared object would
 * have them race on `.assets` and `.slots`.
 */
export function initFlowAssets(): void {
  const current = Scope.get(Flow);
  Scope.set(Flow, { ...current, assets: createAssetState(), slots: createSlotState() });
}

/**
 * Give the current scope an asset state that emits nothing: used for standalone
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
