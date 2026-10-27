import { jsx, renderToString } from "@vincle/core";

export type AssetType = "style" | "script";

export type AssetContent = string | (() => string | Promise<string>);

export type AssetEntry = {
  type: AssetType;
  content: AssetContent;
  attrs: Record<string, string | boolean>;
};

export type AssetState = {
  /**
   * Every `<Style>` / `<Script>` occurrence, in claim (completion) order.
   * Claims say nothing about document order under concurrent siblings, so the
   * registry records them all and the resolution pass decides which wins.
   */
  occurrences: Array<{ name: string; entry: AssetEntry }>;
  /** Names whose first-in-document occurrence already emitted, shell first. */
  emitted: Set<string>;
  /**
   * Suppress every emission, whatever the name. Used for standalone fragment
   * files, which carry no assets of their own: see `renderToStatic`.
   */
  suppressed: boolean;
  /** Random per render, so no markup the author writes can match it. */
  mark: string | undefined;
};

export function createAssetState(): AssetState {
  return { occurrences: [], emitted: new Set(), suppressed: false, mark: undefined };
}

/**
 * A state that emits nothing. It replaces `resolveAssets(html, { isolate: true })`,
 * whose name promised isolation and whose behaviour was suppression: it built a
 * fresh state with no entries, so every marker resolved to nothing and was
 * dropped. Same outcome, decided before the render instead of after it.
 */
export function createSuppressedAssetState(): AssetState {
  return { occurrences: [], emitted: new Set(), suppressed: true, mark: undefined };
}

const MARK_PREFIX = "<!--vincle-asset-";

/**
 * Record one `<Style>` / `<Script>` occurrence and hand back its mark, or
 * nothing when emission is suppressed.
 *
 * Under concurrent siblings the walk reaches occurrences in completion order,
 * not document order, so this only registers: which occurrence of a name wins
 * is decided by `resolveAssets`, from the marks' positions in the finished
 * document. The winner is the first occurrence *in the document*, the rule
 * sequential rendering used to give for free.
 */
export function claimAsset(state: AssetState, name: string, entry: AssetEntry): string | undefined {
  if (state.suppressed) return undefined;
  const first = state.occurrences.find((o) => o.name === name);
  if (
    first &&
    process.env.NODE_ENV !== "production" &&
    (first.entry.type !== entry.type ||
      JSON.stringify(first.entry.attrs) !== JSON.stringify(entry.attrs))
  ) {
    console.warn(
      `[vincle/flow] Asset "${name}" is declared multiple times with different attributes. The first declaration wins.`,
    );
  }
  state.mark ??= crypto.randomUUID();
  const seq = state.occurrences.length;
  state.occurrences.push({ name, entry });
  return `${MARK_PREFIX}${state.mark}:${seq}-->`;
}

/**
 * Settle every asset mark in a rendered document: the first occurrence of a
 * name in document order renders its tag at the mark's position, the rest
 * leave nothing, markers included.
 *
 * The tag is rendered here, by the winner alone: a losing occurrence never
 * evaluates its content factory. The trade-off is that the winning factory
 * runs at resolution time, outside the async context of its document
 * position: a factory must not read tree context (`useContext`); `Scope`
 * reads still work, since resolution runs inside the render's scope.
 *
 * Runs after the render, so completion order cannot leak into the decision;
 * the shell resolves before its fragments, which is what lets a fragment's
 * `<Style>` dedupe against what the shell already emitted.
 */
export async function resolveAssets(html: string, state: AssetState): Promise<string> {
  if (state.suppressed || state.occurrences.length === 0 || state.mark === undefined) return html;
  const open = `${MARK_PREFIX}${state.mark}:`;
  if (!html.includes(open)) return html;
  let out = "";
  let from = 0;
  for (;;) {
    const start = html.indexOf(open, from);
    if (start === -1) break;
    const seqEnd = html.indexOf("-->", start);
    const seq = Number(html.slice(start + open.length, seqEnd));
    out += html.slice(from, start);
    const { name, entry } = state.occurrences[seq]!;
    if (!state.emitted.has(name)) {
      state.emitted.add(name);
      const content = typeof entry.content === "function" ? entry.content() : entry.content;
      out += await renderToString(
        jsx(entry.type, { "data-name": name, ...entry.attrs, children: content }),
      );
    }
    from = seqEnd + 3;
  }
  out += html.slice(from);
  return out;
}
