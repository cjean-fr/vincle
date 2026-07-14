import { describe, it, expect } from "bun:test";

import { createAdapter } from "../adapters/index.js";

describe("createAdapter", () => {
  it("defaults capabilities to full streaming + all merges", () => {
    const a = createAdapter({
      Placeholder: () => null,
      Patch: () => null,
      Frame: () => null,
    });
    expect(a.capabilities.streaming).toBe(true);
    expect(a.capabilities.merges).toContain("append");
  });
});
