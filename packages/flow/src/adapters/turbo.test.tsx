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
  });

  it("Frame renders <turbo-frame>", async () => {
    expect(await renderToString(TurboAdapter.Frame({ id: "x", children: "c" }))).toContain(
      "<turbo-frame",
    );
  });
});
