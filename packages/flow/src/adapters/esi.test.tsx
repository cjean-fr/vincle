import { EsiAdapter } from "../adapters/index.js";
import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

describe("EsiAdapter", () => {
  it("declares no streaming and replace-only merges", () => {
    expect(EsiAdapter.capabilities).toEqual({
      streaming: false,
      merges: ["replace"],
    });
  });

  it("renders esi:include / esi:inline and escapes src", async () => {
    expect(
      await renderToString(
        EsiAdapter.Placeholder({ id: "x", src: "/f?a=1&b=2", children: "" }),
      ),
    ).toContain("&amp;");
    expect(
      await renderToString(
        EsiAdapter.Patch({ id: "x", children: "c", merge: "replace" }),
      ),
    ).toContain("esi:inline");
  });

  it("encode() throws — ESI is CDN-level, not a live stream", () => {
    expect(() => EsiAdapter.encode()).toThrow(/not supported/);
  });
});
