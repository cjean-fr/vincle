import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { HtmxAdapter } from "../adapters/index.js";

describe("HtmxAdapter", () => {
  it("patch uses hx-swap-oob mapped from merge", async () => {
    expect(
      await renderToString(HtmxAdapter.Patch({ id: "x", children: "c", merge: "replace" })),
    ).toContain('hx-swap-oob="outerHTML"');
    expect(
      await renderToString(HtmxAdapter.Patch({ id: "x", children: "c", merge: "before" })),
    ).toContain('hx-swap-oob="beforebegin"');
  });

  it("Frame renders <div>", async () => {
    expect(await renderToString(HtmxAdapter.Frame({ id: "x", children: "c" }))).toContain("<div");
  });
});
