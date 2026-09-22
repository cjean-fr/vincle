import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter } from "../adapters/index.js";

describe("TurboAdapter", () => {
  it("placeholder → turbo-frame; patch → turbo-stream", async () => {
    const ph = await renderToString(
      TurboAdapter.Placeholder({ id: "x", src: "/s", children: "fb" }),
    );
    expect(ph).toContain("turbo-frame");
    expect(ph).toContain('src="/s"');
    const patch = await renderToString(
      TurboAdapter.Patch({ id: "x", children: "c", merge: "append" }),
    );
    expect(patch).toContain('action="append"');
    expect(patch).toContain('target="x"');
    // Turbo morphs on any action carrying `method`, so a leak here would turn
    // every patch into a morph.
    expect(patch).not.toContain("method=");
  });

  it("morph is replace + method=morph: Turbo has no morph action", async () => {
    const patch = await renderToString(
      TurboAdapter.Patch({ id: "x", children: "c", merge: "morph" }),
    );
    expect(patch).toContain('action="replace"');
    expect(patch).toContain('method="morph"');
  });

  it("Frame renders <turbo-frame>", async () => {
    expect(await renderToString(TurboAdapter.Frame({ id: "x", children: "c" }))).toContain(
      "<turbo-frame",
    );
  });
});
