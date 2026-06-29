import { initFlow, Flow } from "./context.js";
import { TurboAdapter, EsiAdapter } from "./adapters/index.js";
import { withScope, useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

describe("initFlow", () => {
  it("initializes the flow context", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      expect(() => useContext(Flow)).not.toThrow();
    });
  });

  it("throws when used outside withScope", () => {
    expect(() =>
      initFlow({ adapter: TurboAdapter, mode: "streaming" }),
    ).toThrow();
  });
});

describe("context.defer()", () => {
  it("registers, validates ids, and is last-wins on duplicate id", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const { defer, pendingStore } = useContext(Flow);
      defer("badge", { content: () => <span>42</span>, merge: "replace" });
      expect(pendingStore.size).toBe(1);
      expect(
        pendingStore.pending(new Set()).find(([id]) => id === "badge")?.[1]
          .merge,
      ).toBe("replace");
      defer("badge", { content: () => <span>43</span>, merge: "append" });
      expect(pendingStore.size).toBe(1);
      expect(
        pendingStore.pending(new Set()).find(([id]) => id === "badge")?.[1]
          .merge,
      ).toBe("append");
      expect(() =>
        defer("has space", { content: () => <span />, merge: "replace" }),
      ).toThrow(/valid fragment id/);
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
        useContext(Flow).defer("x", {
          content: () => <span />,
          merge: "append",
        }),
      ).toThrow(/not supported/);
    });
  });
});
