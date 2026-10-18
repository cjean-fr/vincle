import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import type { MergeType } from "../types.js";

import { HtmxAdapter } from "../adapters/index.js";

const patch = (merge: MergeType, first = false) =>
  renderToString(HtmxAdapter.Patch({ id: "x", children: "c", merge, first }));

describe("HtmxAdapter", () => {
  it("patch uses hx-swap-oob mapped from merge", async () => {
    expect(await patch("replace", true)).toContain('hx-swap-oob="outerHTML"');
    expect(await patch("before")).toContain('hx-swap-oob="beforebegin"');
  });

  it("morph maps to the htmx 4 outerMorph swap", async () => {
    const first = await patch("morph", true);
    expect(first).toContain('hx-swap-oob="outerMorph"');
    // morph is a *how*, not a *where*: what becomes of the fallback is the
    // client's reconciliation, so the first patch is not special for it.
    expect(first).not.toContain("innerHTML");
  });

  it("the boundary's first patch replaces the placeholder's fallback", async () => {
    // `append`/`prepend` get that replacement as their insert: the fallback gone,
    // the boundary is empty, so `innerHTML` *is* the position.
    for (const merge of ["append", "prepend"] as const) {
      const wire = await patch(merge, true);
      expect(wire).toContain('hx-swap-oob="innerHTML"');
      expect(wire).not.toContain("beforeend");
      expect(wire).not.toContain("afterbegin");
    }
    // `before`/`after` insert outside the placeholder: they empty it first,
    // then place the content around what is left. Order matters on the wire.
    const before = await patch("before", true);
    expect(before).toContain('hx-swap-oob="innerHTML"');
    expect(before).toContain('hx-swap-oob="beforebegin"');
    expect(before.indexOf("innerHTML")).toBeLessThan(before.indexOf("beforebegin"));
  });

  it("later patches act at the position, keeping what is already there", async () => {
    expect(await patch("append")).toBe('<div id="x" hx-swap-oob="beforeend">c</div>');
    expect(await patch("before")).toBe('<div id="x" hx-swap-oob="beforebegin">c</div>');
  });

  it("Frame renders <div>", async () => {
    expect(await renderToString(HtmxAdapter.Frame({ id: "x", children: "c" }))).toContain("<div");
  });
});
