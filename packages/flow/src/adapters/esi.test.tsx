import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { EsiAdapter } from "../adapters/index.js";
import { renderToStream } from "../render.js";

describe("EsiAdapter", () => {
  it("declares no streaming and replace-only merges", () => {
    expect(EsiAdapter.capabilities).toEqual({
      streaming: false,
      merges: ["replace"],
    });
  });

  it("renders esi:include / esi:inline and escapes src", async () => {
    expect(
      await renderToString(EsiAdapter.Placeholder({ id: "x", src: "/f?a=1&b=2", children: "" })),
    ).toContain("&amp;");
    expect(
      await renderToString(EsiAdapter.Patch({ id: "x", children: "c", merge: "replace" })),
    ).toContain("esi:inline");
  });

  // `id` comes from `nextId()` today, so it is well-formed by construction.
  // That is a property of the caller, not of this adapter, and it was the only
  // attribute in the repo relying on it — `src` two lines up never did.
  it("escapes id into the esi:inline name attribute", async () => {
    const html = await renderToString(
      EsiAdapter.Patch({ id: 'x" onload="boom', children: "c", merge: "replace" }),
    );
    expect(html).toContain("&quot;");
    expect(html).not.toContain('name="x" onload=');
  });

  it("renderToStream refuses a non-streaming adapter — at compile time and at runtime", () => {
    // @ts-expect-error — EsiAdapter's `capabilities.streaming: false` is not
    // assignable to StreamingAdapter's `capabilities.streaming: true`. If
    // this stops erroring, the compile-time half of the guard regressed
    // silently; the throw below only ever verified the runtime half.
    expect(() => renderToStream(() => <div />, EsiAdapter)).toThrow(/capabilities\.streaming/);
  });
});
