import type { FlowConfig, MergeType, OnError, TemplateContent } from "./types.js";

import { assertFragmentId } from "./utils.js";

/**
 * A unit of template content, keyed by its target DOM `id`. The renderer
 * decides at drain time whether `content` is a one-shot patch or a live
 * stream — see `flushTemplates`. The factory receives an `AbortSignal`
 * combining the request signal with this entry's own `timeout` (if any).
 */
export type TemplateEntry = {
  content: TemplateContent;
  merge: MergeType;
  /** Per-fragment render timeout in ms. Falls back to FlowOptions.defaultTimeout. */
  timeout?: number;
  /** Per-fragment error handler, overriding FlowOptions.onError. */
  onError?: OnError;
};

/**
 * Internal storage for registered template entries.
 *
 * Hides the `Map` implementation behind a narrow interface so callers don't
 * depend on the storage primitive. Iteration logic (filtering processed ids)
 * lives here rather than in `flushTemplates`.
 */
export type TemplateStore = {
  /** Register or overwrite an entry for `id`. Validates merge support. */
  register(id: string, entry: TemplateEntry): void;
  /** Entries whose id is not in `processed`. */
  outstanding(processed: Set<string>): Array<[string, TemplateEntry]>;
  /** True when at least one entry is not in `processed`. */
  hasOutstanding(processed: Set<string>): boolean;
  /** Total registered entries (including processed ones). */
  readonly size: number;
  /** Purge all entries to eagerly release closures and references. */
  clear(): void;
};

const storeMaps = new WeakMap<TemplateStore, Map<string, TemplateEntry>>();

export function createTemplateStore(config: FlowConfig): TemplateStore {
  const map = new Map<string, TemplateEntry>();
  const merges: readonly string[] = config.adapter?.capabilities.merges ?? [];
  const store: TemplateStore = {
    register(id, entry) {
      assertFragmentId(id, "Template");
      if (!config.adapter) {
        throw new Error(
          "Template requires an adapter. " +
            "Pass { adapter: ... } to renderToStatic " +
            "or use an adapter with renderToStream.",
        );
      }
      if (!merges.includes(entry.merge)) {
        throw new Error(
          `Template: merge="${entry.merge}" is not supported by this adapter ` +
            `(supports: ${merges.join(", ")}).`,
        );
      }
      map.set(id, entry);
    },
    outstanding(processed) {
      const result: Array<[string, TemplateEntry]> = [];
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
    },
  };
  storeMaps.set(store, map);
  return store;
}

/** @internal Test helper — exposes the underlying Map for assertion. */
export function debugTemplateStore(store: TemplateStore): {
  get(id: string): TemplateEntry | undefined;
  has(id: string): boolean;
  keys(): IterableIterator<string>;
  entries(): IterableIterator<[string, TemplateEntry]>;
} {
  const map = storeMaps.get(store);
  if (!map) throw new Error("debugTemplateStore: not a valid TemplateStore");
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
