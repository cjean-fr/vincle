import type { FlowConfig, MergeType, OnError, TemplateContent } from "./types.js";

import { PREFIX, assertTimeout } from "./config.js";
import { assertFragmentId } from "./utils.js";

/**
 * A unit of template content, keyed by its target DOM `id`. The renderer
 * decides at drain time whether `content` is a one-shot patch or a live
 * stream — see `flushTemplates`.
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

export function createTemplateStore(config: FlowConfig): TemplateStore {
  const map = new Map<string, TemplateEntry>();
  const merges: readonly string[] = config.adapter?.capabilities.merges ?? [];
  const store: TemplateStore = {
    register(id, entry) {
      assertFragmentId(id, "Template");
      assertTimeout(entry.timeout, `<Template target="${id}">`);
      if (!config.adapter) {
        throw new Error(
          `${PREFIX} <Template target="${id}">: Template requires an adapter — without one there ` +
            "is no placeholder to render and no patch to emit. Pass { adapter: ... } to renderToStatic, " +
            "or render through renderToStream/serve with an adapter " +
            "(TurboAdapter, NativeAdapter, HtmxAdapter, WebPlatformAdapter, EsiAdapter).",
        );
      }
      if (!merges.includes(entry.merge)) {
        const supported =
          merges.length > 0
            ? `it supports: ${merges.join(", ")}`
            : "it supports no merges (static output only)";
        throw new Error(
          `${PREFIX} <Template target="${id}" merge="${entry.merge}">: ` +
            `merge="${entry.merge}" is not supported by this adapter — ${supported}. ` +
            `Pick one of those, or use an adapter that supports "${entry.merge}".`,
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
  return store;
}
