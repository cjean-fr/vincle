import { Scope } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter, EsiAdapter } from "./adapters/index.js";
import { initFlow, initFlowAssets, Flow } from "./context.js";

describe("initFlow", () => {
  it("initializes the flow context", async () => {
    await Scope.with(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      expect(() => Scope.get(Flow)).not.toThrow();
    });
  });

  it("throws when used outside Scope.with", () => {
    expect(() => initFlow({ adapter: TurboAdapter, mode: "streaming" })).toThrow();
  });
});

describe("context.registerFragment()", () => {
  it("registers, validates ids, and is last-wins on duplicate id", async () => {
    await Scope.with(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const { registerFragment, fragments } = Scope.get(Flow);
      registerFragment("badge", { content: <span>42</span>, merge: "replace" });
      expect(fragments.size).toBe(1);
      expect(fragments.outstanding(new Set()).find(([id]) => id === "badge")?.[1].merge).toBe(
        "replace",
      );
      registerFragment("badge", { content: <span>43</span>, merge: "append" });
      expect(fragments.size).toBe(1);
      expect(fragments.outstanding(new Set()).find(([id]) => id === "badge")?.[1].merge).toBe(
        "append",
      );
      expect(() => registerFragment("has space", { content: <span />, merge: "replace" })).toThrow(
        /valid fragment id/,
      );
    });
  });

  it("provides isolated asset states for parallel pages (SSG)", async () => {
    await Scope.with(async () => {
      initFlow({
        adapter: TurboAdapter,
        mode: "static",
        generatePath: (id) => `/f/${id}.html`,
      });
      const parentAssets = Scope.get(Flow).assets;

      // Simulate parallel renderPage calls (SSG pattern — child scope inherits parent via Scope.snapshot)
      const seed = Scope.snapshot();
      const pageTask = (n: number) =>
        Scope.with(async () => {
          initFlowAssets();
          const { assets } = Scope.get(Flow);
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
    await Scope.with(async () => {
      initFlow({
        adapter: EsiAdapter,
        mode: "static",
        generatePath: (id) => `/f/${id}.html`,
      });
      expect(() =>
        Scope.get(Flow).registerFragment("x", {
          content: <span />,
          merge: "append",
        }),
      ).toThrow(/not supported/);
    });
  });
});
