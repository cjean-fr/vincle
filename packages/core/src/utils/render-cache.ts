type AttrMeta = {
  name: string;
  isEvent: boolean;
  isStyle: boolean;
  urlKind: 0 | 1 | 2;
};

class RenderCache {
  readonly validTags = new Set<string>();
  readonly warnedTags = new Set<string>();
  readonly attrMeta = new Map<string, AttrMeta | null>();
  readonly warnedEventHandlers = new Set<string>();

  /** @internal */
  clear(): void {
    this.validTags.clear();
    this.warnedTags.clear();
    this.attrMeta.clear();
    this.warnedEventHandlers.clear();
  }
}

/**
 * Cache shared across renders.
 *
 * Caches tag validity, attribute metadata, and "warn once" tracking.
 * This is intentionally a singleton — the data is purely additive
 * (tag names, attribute names — finite sets) and never invalidates.
 * Rebuilding it per render would be pure overhead with no correctness benefit.
 */
export const renderCache = new RenderCache();
export type { AttrMeta };
