import { describe, it, expect } from "bun:test";

import {
  createAssetState,
  createSuppressedAssetState,
  markEmitted,
  registerAsset,
} from "./assets.js";

// After removal of the marker protocol, this module provides a registry
// and the one-claim-per-name rule used by `<Style>` and `<Script>`. The old
// substitution pass, `createMarker` plus `resolveAssets`, scanned the whole
// document with a regex. It is gone; `components/assets.test.tsx` covers
// the replacement.

describe("createAssetState", () => {
  it("starts empty and emitting", () => {
    const state = createAssetState();
    expect(state.entries.size).toBe(0);
    expect(state.emitted.size).toBe(0);
    expect(state.suppressed).toBe(false);
  });
});

describe("markEmitted", () => {
  it("grants the first claim on a name and refuses the rest", () => {
    const state = createAssetState();
    expect(markEmitted(state, "base")).toBe(true);
    expect(markEmitted(state, "base")).toBe(false);
    expect(markEmitted(state, "base")).toBe(false);
  });

  it("treats names independently", () => {
    const state = createAssetState();
    expect(markEmitted(state, "a")).toBe(true);
    expect(markEmitted(state, "b")).toBe(true);
  });

  it("refuses every name on a suppressed state", () => {
    const state = createSuppressedAssetState();
    expect(markEmitted(state, "anything")).toBe(false);
    expect(markEmitted(state, "other")).toBe(false);
    // …and records nothing, so the state stays inert.
    expect(state.emitted.size).toBe(0);
  });
});

describe("registerAsset", () => {
  it("keeps the first declaration", () => {
    const state = createAssetState();
    registerAsset(state, "x", { type: "style", content: "first", attrs: {} });
    registerAsset(state, "x", { type: "style", content: "second", attrs: {} });
    expect(state.entries.get("x")?.content).toBe("first");
  });

  it("records type and attributes", () => {
    const state = createAssetState();
    registerAsset(state, "m", { type: "script", content: "", attrs: { type: "module" } });
    expect(state.entries.get("m")).toEqual({
      type: "script",
      content: "",
      attrs: { type: "module" },
    });
  });
});
