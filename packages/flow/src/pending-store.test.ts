import { describe, it, expect } from "bun:test";

import type { FlowConfig } from "./types.js";

import { createPendingStore, debugStore } from "./pending-store.js";

function adaptCfg(overrides?: Partial<FlowConfig>): FlowConfig {
  return {
    mode: "static",
    generatePath: (id: string) => `/fragments/${id}`,
    adapter: {
      capabilities: { streaming: false, merges: ["replace", "append"] },
    } as any,
    ...overrides,
  } as FlowConfig;
}

describe("PendingStore", () => {
  describe("defer validation", () => {
    it("throws when no adapter is configured", () => {
      const cfg = adaptCfg({ adapter: undefined });
      const store = createPendingStore(cfg);
      expect(() =>
        store.defer("frag-a", {
          content: "<p>hello</p>",
          merge: "replace",
        }),
      ).toThrow("Defer requires an adapter");
    });

    it("throws when merge type is not supported by adapter", () => {
      const cfg = adaptCfg({
        adapter: {
          capabilities: { streaming: false, merges: ["replace"] },
        } as any,
      });
      const store = createPendingStore(cfg);
      expect(() =>
        store.defer("frag-a", {
          content: "<p>hello</p>",
          merge: "prepend",
        }),
      ).toThrow('merge="prepend" is not supported');
    });

    it("throws when fragment id is invalid", () => {
      const cfg = adaptCfg();
      const store = createPendingStore(cfg);
      expect(() => store.defer("", { content: "x", merge: "replace" })).toThrow(
        'Defer: "" is not a valid fragment id',
      );
      expect(() => store.defer("123abc", { content: "x", merge: "replace" })).toThrow();
    });
  });

  describe("pending / hasPending", () => {
    it("returns only unprocessed entries", () => {
      const store = createPendingStore(adaptCfg());
      store.defer("a", { content: "x", merge: "replace" });
      store.defer("b", { content: "y", merge: "replace" });
      expect(store.pending(new Set(["a"])).map(([id]) => id)).toEqual(["b"]);
    });

    it("hasPending is true when some entries are unprocessed", () => {
      const store = createPendingStore(adaptCfg());
      store.defer("a", { content: "x", merge: "replace" });
      expect(store.hasPending(new Set())).toBe(true);
      expect(store.hasPending(new Set(["a"]))).toBe(false);
    });
  });

  describe("size", () => {
    it("reflects total entries regardless of processing", () => {
      const store = createPendingStore(adaptCfg());
      expect(store.size).toBe(0);
      store.defer("a", { content: "x", merge: "replace" });
      expect(store.size).toBe(1);
    });
  });

  describe("clear", () => {
    it("purges all entries", () => {
      const store = createPendingStore(adaptCfg());
      store.defer("a", { content: "x", merge: "replace" });
      store.clear();
      expect(store.size).toBe(0);
      expect(store.pending(new Set())).toEqual([]);
    });
  });

  describe("debugStore", () => {
    it("exposes the underlying map for assertions", () => {
      const store = createPendingStore(adaptCfg());
      store.defer("test", { content: "<p>x</p>", merge: "replace" });
      const d = debugStore(store);
      expect(d.has("test")).toBe(true);
      expect(d.get("test")?.content).toBe("<p>x</p>");
      expect(Array.from(d.keys())).toEqual(["test"]);
    });

    it("throws for an invalid store", () => {
      expect(() => debugStore({} as any)).toThrow("not a valid PendingStore");
    });
  });
});
