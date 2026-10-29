import { describe, it, expect } from "bun:test";

import {
  claimAsset,
  createAssetState,
  createSuppressedAssetState,
  resolveAssets,
} from "./assets.js";

// `<Style>` and `<Script>` claim in completion order under concurrent
// siblings, so deduplication cannot be decided at claim time: this module
// records every occurrence, brackets it with a mark, and `resolveAssets`
// keeps the first occurrence of a name in *document* order. The old
// substitution pass scanned the whole document with a regex over the tag
// itself; the marks are random per render, so author markup cannot collide.

describe("createAssetState", () => {
  it("starts empty and emitting", () => {
    const state = createAssetState();
    expect(state.occurrences.length).toBe(0);
    expect(state.emitted.size).toBe(0);
    expect(state.suppressed).toBe(false);
  });
});

describe("claimAsset", () => {
  it("records every occurrence, duplicates included", () => {
    const state = createAssetState();
    expect(claimAsset(state, "base", { type: "style", content: "a", attrs: {} })).toBeDefined();
    expect(claimAsset(state, "base", { type: "style", content: "b", attrs: {} })).toBeDefined();
    expect(state.occurrences.length).toBe(2);
  });

  it("hands back a mark that names its occurrence", () => {
    const state = createAssetState();
    const mark = claimAsset(state, "x", { type: "style", content: "", attrs: {} })!;
    expect(mark).toBe(`<!--vincle-asset-${state.mark}:0-->`);
  });

  it("refuses every name on a suppressed state", () => {
    const state = createSuppressedAssetState();
    expect(
      claimAsset(state, "anything", { type: "style", content: "", attrs: {} }),
    ).toBeUndefined();
    expect(state.occurrences.length).toBe(0);
  });
});

describe("resolveAssets", () => {
  const style = (content: string | (() => string), attrs = {}) => ({
    type: "style" as const,
    content,
    attrs,
  });

  it("keeps the first occurrence in document order, whatever the claim order", async () => {
    const state = createAssetState();
    // The later-in-document occurrence claims first, as happens when the
    // earlier sibling is async: resolution must still pick the early one.
    const late = claimAsset(state, "x", style(".late{}"))!;
    const early = claimAsset(state, "x", style(".early{}"))!;
    const html = `<p>${early}</p><div>${late}</div>`;
    expect(await resolveAssets(html, state)).toBe(
      '<p><style data-name="x">.early{}</style></p><div></div>',
    );
    expect(state.emitted.has("x")).toBe(true);
  });

  it("renders the tag with its attributes through the core serializer", async () => {
    const state = createAssetState();
    const mark = claimAsset(state, "m", {
      type: "script",
      content: "let a = 1 < 2;",
      attrs: { src: "/a.js", type: "module", defer: true },
    })!;
    expect(await resolveAssets(mark, state)).toBe(
      '<script data-name="m" src="/a.js" type="module" defer>let a = 1 < 2;</script>',
    );
  });

  it("evaluates only the winning occurrence's factory", async () => {
    const state = createAssetState();
    let loserRuns = 0;
    const winner = claimAsset(
      state,
      "x",
      style(() => ".w{}"),
    )!;
    claimAsset(state, "x", {
      type: "style",
      content: () => {
        loserRuns++;
        return ".l{}";
      },
      attrs: {},
    });
    const html = `${winner}${state.mark ? `<!--vincle-asset-${state.mark}:1-->` : ""}`;
    await resolveAssets(html, state);
    expect(loserRuns).toBe(0);
  });

  it("dedupes against names already emitted by an earlier document", async () => {
    const state = createAssetState();
    const first = claimAsset(state, "x", style(".shell{}"))!;
    await resolveAssets(`<body>${first}</body>`, state);
    // A fragment rendered afterwards loses to the shell, like before.
    const second = claimAsset(state, "x", style(".fragment{}"))!;
    expect(await resolveAssets(`<div>${second}</div>`, state)).toBe("<div></div>");
  });

  it("treats names independently", async () => {
    const state = createAssetState();
    const a = claimAsset(state, "a", style(".a{}"))!;
    const b = claimAsset(state, "b", style(".b{}"))!;
    expect(await resolveAssets(`${a}${b}`, state)).toBe(
      '<style data-name="a">.a{}</style><style data-name="b">.b{}</style>',
    );
  });
});
