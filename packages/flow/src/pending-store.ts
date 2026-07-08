import type { DeferContent, FlowConfig, MergeType, OnError } from "./types.js";
import { assertFragmentId } from "./utils.js";

/**
 * A unit of deferred work, keyed by its target DOM `id`. The renderer decides
 * at drain time whether `content` is a one-shot patch or a live stream — see
 * `streamFlow`. The factory receives an `AbortSignal` combining the request
 * signal with this entry's own `timeout` (if any).
 */
export type Pending = {
  content: DeferContent;
  merge: MergeType;
  /** Per-fragment render timeout in ms. Falls back to FlowOptions.defaultTimeout. */
  timeout?: number;
  /** Per-fragment error handler, overriding FlowOptions.onError. */
  onError?: OnError;
};

/**
 * Internal storage for pending deferred work.
 *
 * Hides the `Map` implementation behind a narrow interface so callers don't
 * depend on the storage primitive. Iteration logic (filtering processed ids)
 * lives here rather than in `streamFlow`.
 */
export type PendingStore = {
  /** Register or overwrite a deferred entry for `id`. Validates merge support. */
  defer(id: string, entry: Pending): void;
  /** Entries whose id is not in `processed`. */
  pending(processed: Set<string>): Array<[string, Pending]>;
  /** True when at least one entry is not in `processed`. */
  hasPending(processed: Set<string>): boolean;
  /** Total registered entries (including processed ones). */
  readonly size: number;
  /** Purge all entries to eagerly release closures and references. */
  clear(): void;
};

const storeMaps = new WeakMap<PendingStore, Map<string, Pending>>();

export function createPendingStore(config: FlowConfig): PendingStore {
  const map = new Map<string, Pending>();
  const merges: readonly string[] = config.adapter?.capabilities.merges ?? [];
  const store: PendingStore = {
    defer(id, entry) {
      assertFragmentId(id, "Defer");
      if (!config.adapter) {
        throw new Error(
          "Defer requires an adapter. " +
            "Pass { adapter: ... } to renderToStatic " +
            "or use an adapter with renderStream.",
        );
      }
      if (!merges.includes(entry.merge)) {
        throw new Error(
          `Defer: merge="${entry.merge}" is not supported by this adapter ` +
            `(supports: ${merges.join(", ")}).`,
        );
      }
      map.set(id, entry);
    },
    pending(processed) {
      const result: Array<[string, Pending]> = [];
      for (const [id, entry] of map) {
        if (!processed.has(id)) result.push([id, entry]);
      }
      return result;
    },
    hasPending(processed) {
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
    },
  };
  storeMaps.set(store, map);
  return store;
}

/** @internal Test helper — exposes the underlying Map for assertion. */
export function debugStore(store: PendingStore): {
  get(id: string): Pending | undefined;
  has(id: string): boolean;
  keys(): IterableIterator<string>;
  entries(): IterableIterator<[string, Pending]>;
} {
  const map = storeMaps.get(store);
  if (!map) throw new Error("debugStore: not a valid PendingStore");
  return {
    get(id) {
      return map.get(id);
    },
    has(id) {
      return map.has(id);
    },
    keys() {
      return map.keys();
    },
    entries() {
      return map.entries();
    },
  };
}
