/**
 * The search dialog as an explicit state machine.
 *
 * Three things used to be inferred from the DOM at once: whether the dialog was
 * open (`dialog.open`), whether it was animating out (`closing` class), and
 * whether the index had loaded (`index` plus `input.disabled`). That made
 * illegal bundles representable: a "closing but reopening" dialog, a render
 * resolving after a newer query, an error that could never retry.
 *
 * The states below are the legal bundles. The controller in `search.ts` owns
 * the DOM; this module owns the transitions, so both are testable alone.
 *
 * ```
 * closed ──open (index ready)──────────────────────────────▶ open
 * closed ──open (index idle/failed)──▶ loading ──loaded────▶ open
 * loading ──failed──▶ error ──open──▶ loading               (retry)
 * open | loading | error ──close──▶ closing ──closed──▶ closed
 * closing ──open──▶ open (index ready) | loading
 * ```
 *
 * `index` is the index resource, not the dialog: a load that finishes after the
 * dialog closes records `ready` on a closed machine, so the next open is
 * instant. Selection only exists while the dialog is open.
 */

export const SEARCH_PHASES = ["closed", "loading", "open", "error", "closing"] as const;
export type SearchPhase = (typeof SEARCH_PHASES)[number];

export const INDEX_PHASES = ["idle", "loading", "ready", "failed"] as const;
export type IndexPhase = (typeof INDEX_PHASES)[number];

export interface SearchState {
  /** Dialog lifecycle. */
  readonly phase: SearchPhase;
  /** Index resource; orthogonal to the dialog and retained across closes. */
  readonly index: IndexPhase;
  /** The query currently rendered. Empty while the index is not ready. */
  readonly query: string;
  /** Number of results rendered for `query`. */
  readonly matches: number;
  /** Highlighted result, or -1 for none. */
  readonly selected: number;
}

export type SearchEvent =
  | { readonly type: "open" }
  | { readonly type: "index-loaded" }
  | { readonly type: "index-failed" }
  | { readonly type: "query"; readonly query: string; readonly matches: number }
  | { readonly type: "select"; readonly index: number }
  | { readonly type: "next" }
  | { readonly type: "previous" }
  | { readonly type: "close" }
  | { readonly type: "closed" };

export const INITIAL_SEARCH_STATE: SearchState = {
  phase: "closed",
  index: "idle",
  query: "",
  matches: 0,
  selected: -1,
};

const closed = (state: SearchState): SearchState => ({
  ...state,
  phase: "closed",
  query: "",
  matches: 0,
  selected: -1,
});

/**
 * Apply one event. Returning the same object means "no transition": callers
 * use identity to skip DOM work, so a repeated event stays free.
 */
export function reduceSearch(state: SearchState, event: SearchEvent): SearchState {
  switch (event.type) {
    case "open": {
      if (state.phase === "open" || state.phase === "loading") return state;
      if (state.index === "ready") {
        // Reopening mid-close keeps the query and results on screen; opening
        // from closed or after an error starts a clean dialog.
        const fresh = state.phase === "closed" || state.phase === "error";
        return {
          ...state,
          phase: "open",
          ...(fresh ? { query: "", matches: 0, selected: -1 } : {}),
        };
      }
      return { ...state, phase: "loading", index: "loading", selected: -1 };
    }

    case "index-loaded": {
      if (state.index === "ready") return state;
      if (state.phase === "closed" || state.phase === "closing")
        return { ...state, index: "ready" };
      return { ...state, phase: "open", index: "ready" };
    }

    case "index-failed": {
      if (state.phase === "closed" || state.phase === "closing")
        return { ...state, index: "failed" };
      if (state.phase === "loading")
        return { ...state, phase: "error", index: "failed", selected: -1 };
      // A loaded index never "fails": a late rejection must not blank results.
      return state;
    }

    case "query": {
      if (state.phase !== "open") return state;
      if (state.query === event.query && state.matches === event.matches && state.selected === -1)
        return state;
      return { ...state, query: event.query, matches: event.matches, selected: -1 };
    }

    case "select": {
      if (state.phase !== "open" || event.index < 0 || event.index >= state.matches) return state;
      return state.selected === event.index ? state : { ...state, selected: event.index };
    }

    case "next":
      if (state.phase !== "open" || state.matches === 0) return state;
      return { ...state, selected: (state.selected + 1) % state.matches };

    case "previous":
      if (state.phase !== "open" || state.matches === 0) return state;
      // From no selection, "previous" wraps to the last result, not the
      // penultimate one: the old arithmetic skipped the end.
      return { ...state, selected: state.selected <= 0 ? state.matches - 1 : state.selected - 1 };

    case "close":
      if (state.phase === "closed" || state.phase === "closing") return state;
      return { ...state, phase: "closing", selected: -1 };

    case "closed":
      return state.phase === "closed" ? state : closed(state);
  }
}

type Listener = (state: SearchState, previous: SearchState, event: SearchEvent) => void;

/**
 * Small runtime around {@link reduceSearch}: identity-preserving sends and a
 * subscription for the DOM controller. No timer, fetch or element in here.
 */
export function createSearchMachine(initial: SearchState = INITIAL_SEARCH_STATE) {
  let current = initial;
  const listeners = new Set<Listener>();
  return {
    get state(): SearchState {
      return current;
    },
    /** Returns false when the event is illegal in the current state. */
    send(event: SearchEvent): boolean {
      const previous = current;
      const next = reduceSearch(previous, event);
      if (next === previous) return false;
      current = next;
      for (const listener of listeners) listener(next, previous, event);
      return true;
    },
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SearchMachine = ReturnType<typeof createSearchMachine>;
