import { describe, expect, it } from "bun:test";

import {
  INITIAL_SEARCH_STATE,
  createSearchMachine,
  reduceSearch,
  type SearchEvent,
  type SearchState,
} from "../src/_client/search-state.js";

const run = (events: SearchEvent[], initial: SearchState = INITIAL_SEARCH_STATE): SearchState =>
  events.reduce(reduceSearch, initial);

const ready = (overrides: Partial<SearchState> = {}): SearchState => ({
  ...INITIAL_SEARCH_STATE,
  phase: "open",
  index: "ready",
  ...overrides,
});

describe("search dialog state machine", () => {
  it("starts closed with no index", () => {
    expect(INITIAL_SEARCH_STATE).toEqual({
      phase: "closed",
      index: "idle",
      query: "",
      matches: 0,
      selected: -1,
    });
  });

  it("loads the index before opening", () => {
    expect(run([{ type: "open" }])).toMatchObject({ phase: "loading", index: "loading" });
    expect(run([{ type: "open" }, { type: "index-loaded" }])).toMatchObject({
      phase: "open",
      index: "ready",
    });
  });

  it("opens immediately when the index is already cached", () => {
    const state = ready({ phase: "closed", query: "ignored" });
    expect(reduceSearch(state, { type: "open" })).toMatchObject({
      phase: "open",
      index: "ready",
      query: "",
    });
  });

  it("reopens during the closing animation and keeps the query", () => {
    const closing = run([
      { type: "index-loaded" },
      { type: "open" },
      { type: "query", query: "router", matches: 3 },
      { type: "close" },
    ]);
    expect(closing.phase).toBe("closing");
    expect(reduceSearch(closing, { type: "open" })).toMatchObject({
      phase: "open",
      query: "router",
      matches: 3,
    });
  });

  it("resets the query only once the dialog has finished closing", () => {
    const closing = run([
      { type: "index-loaded" },
      { type: "open" },
      { type: "query", query: "router", matches: 3 },
      { type: "select", index: 2 },
      { type: "close" },
    ]);
    expect(closing).toMatchObject({ phase: "closing", query: "router", selected: -1 });
    expect(reduceSearch(closing, { type: "closed" })).toMatchObject({
      phase: "closed",
      index: "ready",
      query: "",
      matches: 0,
      selected: -1,
    });
  });

  it("retries a failed index load on the next open", () => {
    const failed = run([{ type: "open" }, { type: "index-failed" }]);
    expect(failed).toMatchObject({ phase: "error", index: "failed" });
    expect(reduceSearch(failed, { type: "open" })).toMatchObject({
      phase: "loading",
      index: "loading",
    });
  });

  it("remembers a late index load while closed", () => {
    const state = run([{ type: "open" }, { type: "close" }, { type: "index-loaded" }]);
    expect(state).toMatchObject({ phase: "closing", index: "ready" });
    expect(reduceSearch(reduceSearch(state, { type: "closed" }), { type: "open" })).toMatchObject({
      phase: "open",
      index: "ready",
    });
  });

  it("remembers a late index failure while closed", () => {
    const state = run([{ type: "open" }, { type: "close" }, { type: "index-failed" }]);
    expect(state).toMatchObject({ phase: "closing", index: "failed" });
  });

  it("ignores a late failure after the index is ready", () => {
    const state = ready({ query: "router", matches: 2, selected: 1 });
    expect(reduceSearch(state, { type: "index-failed" })).toBe(state);
  });

  it("resets selection when the query changes, but not on an identical event", () => {
    const state = ready({ query: "router", matches: 2, selected: 1 });
    expect(reduceSearch(state, { type: "query", query: "router", matches: 2 })).toEqual({
      ...state,
      selected: -1,
    });
    const untouched = ready();
    expect(reduceSearch(untouched, { type: "query", query: "", matches: 0 })).toBe(untouched);
  });

  it("cycles forward and wraps backward from no selection to the end", () => {
    const base = ready({ matches: 3, selected: -1 });
    expect(reduceSearch(base, { type: "next" }).selected).toBe(0);
    expect(reduceSearch({ ...base, selected: 2 }, { type: "next" }).selected).toBe(0);
    expect(reduceSearch(base, { type: "previous" }).selected).toBe(2);
    expect(reduceSearch({ ...base, selected: 0 }, { type: "previous" }).selected).toBe(2);
  });

  it("rejects selection outside the rendered results", () => {
    const base = ready({ matches: 2, selected: 1 });
    expect(reduceSearch(base, { type: "select", index: -1 })).toBe(base);
    expect(reduceSearch(base, { type: "select", index: 2 })).toBe(base);
    expect(reduceSearch(base, { type: "select", index: 1 })).toBe(base);
    expect(reduceSearch(base, { type: "select", index: 0 }).selected).toBe(0);
  });

  it("ignores navigation and queries while not open", () => {
    const closed = INITIAL_SEARCH_STATE;
    for (const event of [
      { type: "next" },
      { type: "previous" },
      { type: "select", index: 0 },
      { type: "query", query: "x", matches: 1 },
    ] as const)
      expect(reduceSearch(closed, event)).toBe(closed);
  });

  it("treats a native close as authoritative", () => {
    const open = ready({ query: "router", matches: 2, selected: 1 });
    expect(reduceSearch(open, { type: "closed" })).toMatchObject({
      phase: "closed",
      index: "ready",
      query: "",
      matches: 0,
      selected: -1,
    });
  });

  it("notifies subscribers once per real transition", () => {
    const machine = createSearchMachine();
    const seen: string[] = [];
    machine.subscribe((state) => seen.push(state.phase));
    expect(machine.send({ type: "open" })).toBe(true);
    expect(machine.send({ type: "open" })).toBe(false);
    expect(machine.send({ type: "index-loaded" })).toBe(true);
    expect(machine.state.phase).toBe("open");
    expect(seen).toEqual(["loading", "open"]);
  });
});
