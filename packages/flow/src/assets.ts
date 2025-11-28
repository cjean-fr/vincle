export type AssetType = "style" | "script";

export type AssetContent = string | (() => string | Promise<string>);

export type AssetEntry = {
  type: AssetType;
  content: AssetContent;
  attrs: Record<string, string | boolean>;
};

export type AssetState = {
  entries: Map<string, AssetEntry>;
  emitted: Set<string>;
  /**
   * Suppress every emission, whatever the name. Used for standalone fragment
   * files, which carry no assets of their own — see `renderToStatic`.
   */
  suppressed: boolean;
};

export function createAssetState(): AssetState {
  return { entries: new Map(), emitted: new Set(), suppressed: false };
}

/**
 * A state that emits nothing. It replaces `resolveAssets(html, { isolate: true })`,
 * whose name promised isolation and whose behaviour was suppression: it built a
 * fresh state with no entries, so every marker resolved to nothing and was
 * dropped. Same outcome, decided before the render instead of after it.
 */
export function createSuppressedAssetState(): AssetState {
  return { entries: new Map(), emitted: new Set(), suppressed: true };
}

export function registerAsset(state: AssetState, name: string, entry: AssetEntry): void {
  if (state.entries.has(name)) {
    if (process.env.NODE_ENV !== "production") {
      const existing = state.entries.get(name)!;
      if (
        existing.type !== entry.type ||
        JSON.stringify(existing.attrs) !== JSON.stringify(entry.attrs)
      ) {
        console.warn(
          `[vincle/flow] Asset "${name}" is declared multiple times with different attributes. The first declaration wins.`,
        );
      }
    }
    return;
  }
  state.entries.set(name, entry);
}

/**
 * Claim the right to emit `name`, once.
 *
 * This is the whole deduplication mechanism, and it works because the engine
 * renders in document order: the first `<Style name="x">` the walk reaches is,
 * by construction, the first one in the document. Nothing has to re-derive that
 * ordering afterwards.
 */
export function markEmitted(state: AssetState, name: string): boolean {
  if (state.suppressed || state.emitted.has(name)) return false;
  state.emitted.add(name);
  return true;
}
