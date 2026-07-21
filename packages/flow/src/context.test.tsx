import { withScope, useContext, snapshot } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter, EsiAdapter } from "./adapters/index.js";
import { initFlow, initFlowAssets, Flow } from "./context.js";

describe("initFlow", () => {
  it("initializes the flow context", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      expect(() => useContext(Flow)).not.toThrow();
    });
  });

  it("throws when used outside withScope", () => {
    expect(() => initFlow({ adapter: TurboAdapter, mode: "streaming" })).toThrow();
  });
});

describe("context.registerTemplate()", () => {
  it("registers, validates ids, and is last-wins on duplicate id", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const { registerTemplate, templateStore } = useContext(Flow);
      registerTemplate("badge", { content: <span>42</span>, merge: "replace" });
      expect(templateStore.size).toBe(1);
      expect(templateStore.outstanding(new Set()).find(([id]) => id === "badge")?.[1].merge).toBe(
        "replace",
      );
      registerTemplate("badge", { content: <span>43</span>, merge: "append" });
      expect(templateStore.size).toBe(1);
      expect(templateStore.outstanding(new Set()).find(([id]) => id === "badge")?.[1].merge).toBe(
        "append",
      );
      expect(() =>
        registerTemplate("has space", { content: <span />, merge: "replace" }),
      ).toThrow(/valid fragment id/);
    });
  });

  it("provides isolated asset states for parallel pages (SSG)", async () => {
    await withScope(async () => {
      initFlow({
        adapter: TurboAdapter,
        mode: "static",
        generatePath: (id) => `/f/${id}.html`,
      });
      const parentAssets = useContext(Flow).assets;

      // Simulate parallel renderPage calls (SSG pattern — child scope inherits parent via snapshot)
      const seed = snapshot();
      const pageTask = (n: number) =>
        withScope(async () => {
          initFlowAssets();
          const { assets } = useContext(Flow);
          const name = `page-${n}`;
          assets.entries.set(name, {
            type: "style" as const,
            content: `.x{color:red}`,
            attrs: {},
          });
          return assets;
        }, seed);
      const [childA, childB] = await Promise.all([pageTask(1), pageTask(2)]);

      // Each page got its own asset state
      expect(childA).not.toBe(childB);
      expect(childA.entries.has("page-1")).toBe(true);
      expect(childA.entries.has("page-2")).toBe(false);
      expect(childB.entries.has("page-2")).toBe(true);
      expect(childB.entries.has("page-1")).toBe(false);

      // Parent scope's assets are untouched
      expect(parentAssets.entries.size).toBe(0);
    });
  });

  it("rejects a merge the adapter cannot express (capabilities)", async () => {
    await withScope(async () => {
      initFlow({
        adapter: EsiAdapter,
        mode: "static",
        generatePath: (id) => `/f/${id}.html`,
      });
      expect(() =>
        useContext(Flow).registerTemplate("x", {
          content: <span />,
          merge: "append",
        }),
      ).toThrow(/not supported/);
    });
  });
});
