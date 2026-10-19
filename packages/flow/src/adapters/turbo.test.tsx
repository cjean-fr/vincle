import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import type { MergeType } from "../types.js";

import { TurboAdapter } from "../adapters/index.js";

const patch = (merge: MergeType, first = false) =>
  renderToString(TurboAdapter.Patch({ id: "x", children: "c", merge, first }));

describe("TurboAdapter", () => {
  it("placeholder → turbo-frame; patch → turbo-stream", async () => {
    const ph = await renderToString(
      TurboAdapter.Placeholder({ id: "x", src: "/s", children: "fb" }),
    );
    expect(ph).toContain("turbo-frame");
    expect(ph).toContain('src="/s"');
    const later = await patch("append");
    expect(later).toContain('action="append"');
    expect(later).toContain('target="x"');
    // Turbo morphs on any action carrying `method`, so a leak here would turn
    // every patch into a morph.
    expect(later).not.toContain("method=");
  });

  it("morph is replace + method=morph: Turbo has no morph action", async () => {
    const first = await patch("morph", true);
    expect(first).toContain('action="replace"');
    expect(first).toContain('method="morph"');
    // morph is a *how*, not a *where*: Turbo answers it with a morphing
    // `replace`, which swaps the frame itself, so the first patch is not
    // special for it either.
    expect(first).not.toContain('action="update"');
  });

  it("update is its own action: content-only, no method", async () => {
    // Turbo has an `update` action: it replaces the target's content and keeps
    // the element. No `method=` (that would make it a morph) and no second stream
    // (that would be a positioned insert).
    const first = await patch("update", true);
    expect(first).toContain('action="update"');
    expect(first).not.toContain("method=");
    expect(first).toBe(
      '<turbo-stream action="update" target="x"><template>c</template></turbo-stream>',
    );
    // The second patch acts the same: `update` is not a fallback to empty first.
    expect(await patch("update")).toBe(first);
  });

  it("the boundary's first patch replaces the placeholder's fallback", async () => {
    // `append`/`prepend` get that replacement as their insert: the fallback gone,
    // the frame is empty, so `update` *is* the position.
    for (const merge of ["append", "prepend"] as const) {
      const wire = await patch(merge, true);
      expect(wire).toContain('action="update"');
      expect(wire).not.toContain(`action="${merge}"`);
      expect(wire).not.toContain("method=");
    }
    // `before`/`after` insert outside the frame: they empty it first, then place
    // the content around what is left. Order matters on the wire.
    const before = await patch("before", true);
    expect(before).toContain('action="update"');
    expect(before).toContain('action="before"');
    expect(before.indexOf('action="update"')).toBeLessThan(before.indexOf('action="before"'));
  });

  it("later patches act at the position, keeping what is already there", async () => {
    expect(await patch("append")).toContain('action="append"');
    expect(await patch("before")).toContain('action="before"');
  });

  it("Frame renders <turbo-frame>", async () => {
    expect(await renderToString(TurboAdapter.Frame({ id: "x", children: "c" }))).toContain(
      "<turbo-frame",
    );
  });
});
