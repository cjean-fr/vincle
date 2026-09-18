import type { JSX } from "@vincle/core";

import type { DeferContent, FragmentGroupData, FlowConfig, MergeType, OnError } from "./types.js";

import { PREFIX, assertTimeout } from "./config.js";
import { ERR_FLOW_MERGE_UNSUPPORTED, ERR_FLOW_NO_ADAPTER, vincleError } from "./errors.js";
import { assertFragmentId } from "./utils.js";

/**
 * A unit of deferred content, keyed by its target DOM `id`. The renderer
 * decides at drain time whether `content` is a one-shot patch or a live
 * stream — see `flushFragments`.
 */
export type FragmentEntry = {
  content: DeferContent;
  /** Tree context at the point where the fragment was registered. */
  treeScope?: <T>(render: () => T) => T;
  merge: MergeType;
  /** Per-fragment render timeout in ms. Falls back to FlowOptions.defaultTimeout. */
  timeout?: number;
  /** Per-fragment error handler, overriding FlowOptions.onError. */
  onError?: OnError;
  /** Initial fallback content rendered in the placeholder element. */
  fallback?: JSX.Element;
  /** Id of the fragment group this fragment belongs to, if any. */
  groupId?: string;
};

/**
 * Internal storage for registered fragment entries.
 *
 * Hides the `Map` implementation behind a narrow interface so callers don't
 * depend on the storage primitive. Iteration logic (filtering processed ids)
 * lives here rather than in `flushFragments`.
 */
export type FragmentStore = {
  /** Register or overwrite an entry for `id`. Validates merge support. */
  register(id: string, entry: FragmentEntry): void;
  /** Retrieve a registered entry by id. */
  get(id: string): FragmentEntry | undefined;
  /** Entries whose id is not in `processed`. */
  outstanding(processed: Set<string>): Array<[string, FragmentEntry]>;
  /** True when at least one entry is not in `processed`. */
  hasOutstanding(processed: Set<string>): boolean;
  /** Total registered entries (including processed ones). */
  readonly size: number;
  /** Purge all entries to eagerly release closures and references. */
  clear(): void;
  /** Register a fragment group */
  addGroup(group: FragmentGroupData): void;
  /** Retrieve a fragment group by id */
  getGroup(id: string): FragmentGroupData | undefined;
};

export function createFragmentStore(config: FlowConfig): FragmentStore {
  const map = new Map<string, FragmentEntry>();
  const deferGroups = new Map<string, FragmentGroupData>();
  const merges: readonly string[] = config.adapter?.capabilities.merges ?? [];
  const store: FragmentStore = {
    register(id, entry) {
      assertFragmentId(id, "Defer");
      assertTimeout(entry.timeout, `<Defer target="${id}">`);
      if (!config.adapter) {
        throw vincleError(
          `${PREFIX} <Defer target="${id}">: Defer requires an adapter — without one there ` +
            "is no placeholder to render and no patch to emit. Pass { adapter: ... } to renderToStatic, " +
            "or render through renderToStream/serve with an adapter " +
            "(TurboAdapter, NativeAdapter, HtmxAdapter, WebPlatformAdapter, EsiAdapter).",
          ERR_FLOW_NO_ADAPTER,
        );
      }
      if (!merges.includes(entry.merge)) {
        const supported =
          merges.length > 0
            ? `it supports: ${merges.join(", ")}`
            : "it supports no merges (static output only)";
        throw vincleError(
          `${PREFIX} <Defer target="${id}" merge="${entry.merge}">: ` +
            `merge="${entry.merge}" is not supported by this adapter — ${supported}. ` +
            `Pick one of those, or use an adapter that supports "${entry.merge}".`,
          ERR_FLOW_MERGE_UNSUPPORTED,
        );
      }
      map.set(id, entry);
    },
    get(id) {
      return map.get(id);
    },
    outstanding(processed) {
      const result: Array<[string, FragmentEntry]> = [];
      for (const [id, entry] of map) {
        if (!processed.has(id)) result.push([id, entry]);
      }
      return result;
    },
    hasOutstanding(processed) {
      for (const id of map.keys()) {
        if (!processed.has(id)) return true;
      }
      return false;
    },
    get size() {
      return map.size;
    },
    clear() {
      map.clear();
      deferGroups.clear();
    },
    addGroup(group) {
      deferGroups.set(group.id, group);
    },
    getGroup(id) {
      return deferGroups.get(id);
    },
  };
  return store;
}
