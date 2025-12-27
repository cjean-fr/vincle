import { describe, it, expect } from "bun:test";

import { createAdapter } from "../adapters/index.js";

describe("createAdapter", () => {
  it("defaults capabilities to full streaming + all merges", () => {
    const a = createAdapter({
      Placeholder: () => null as any,
      Patch: () => null as any,
      Frame: () => null as any,
    });
    expect(a.capabilities.streaming).toBe(true);
    expect(a.capabilities.merges).toContain("append");
  });
});
