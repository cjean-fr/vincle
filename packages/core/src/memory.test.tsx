import { describe, it, expect } from "bun:test";

import { renderToString } from "./index.js";
import { jsx } from "./jsx-runtime.js";

describe("memory usage", () => {
  it("heap grows less than 10% across 500k renders after warmup", async () => {
    const node = jsx("div", {
      id: "root",
      class: "container",
      children: "hello",
    });

    // warmup: JIT compile the render pipeline and let the runtime settle
    for (let i = 0; i < 1_000; i++) await renderToString(node);

    Bun.gc(true);
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500_000; i++) await renderToString(node);

    Bun.gc(true);
    const after = process.memoryUsage().heapUsed;

    // Relative threshold avoids architecture-specific KB limits.
    // Absolute growth < 50 KB is still asserted as a sanity check.
    const growth = after - before;
    const growthPercent = (growth / before) * 100;
    expect(growthPercent).toBeLessThan(10);
    expect(growth / 1024).toBeLessThan(50);
  });
});
