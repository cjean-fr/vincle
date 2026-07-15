import { describe, it, expect } from "bun:test";

import type { FlowConfig } from "./types.js";

import { createTemplateStore, debugTemplateStore } from "./template-store.js";

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

describe("TemplateStore", () => {
  describe("register validation", () => {
    it("throws when no adapter is configured", () => {
      const cfg = adaptCfg({ adapter: undefined });
      const store = createTemplateStore(cfg);
      expect(() =>
        store.register("frag-a", {
          content: "<p>hello</p>",
          merge: "replace",
        }),
      ).toThrow("Template requires an adapter");
    });

    it("throws when merge type is not supported by adapter", () => {
      const cfg = adaptCfg({
        adapter: {
          capabilities: { streaming: false, merges: ["replace"] },
        } as any,
      });
      const store = createTemplateStore(cfg);
      expect(() =>
        store.register("frag-a", {
          content: "<p>hello</p>",
          merge: "prepend",
        }),
      ).toThrow('merge="prepend" is not supported');
    });

    it("throws when fragment id is invalid", () => {
      const cfg = adaptCfg();
      const store = createTemplateStore(cfg);
      expect(() => store.register("", { content: "x", merge: "replace" })).toThrow(
        'Template: "" is not a valid fragment id',
      );
      expect(() => store.register("123abc", { content: "x", merge: "replace" })).toThrow();
    });
  });

  describe("outstanding / hasOutstanding", () => {
    it("returns only unprocessed entries", () => {
      const store = createTemplateStore(adaptCfg());
      store.register("a", { content: "x", merge: "replace" });
      store.register("b", { content: "y", merge: "replace" });
      expect(store.outstanding(new Set(["a"])).map(([id]) => id)).toEqual(["b"]);
    });

    it("hasOutstanding is true when some entries are unprocessed", () => {
      const store = createTemplateStore(adaptCfg());
      store.register("a", { content: "x", merge: "replace" });
      expect(store.hasOutstanding(new Set())).toBe(true);
      expect(store.hasOutstanding(new Set(["a"]))).toBe(false);
    });
  });

  describe("size", () => {
    it("reflects total entries regardless of processing", () => {
      const store = createTemplateStore(adaptCfg());
      expect(store.size).toBe(0);
      store.register("a", { content: "x", merge: "replace" });
      expect(store.size).toBe(1);
    });
  });

  describe("clear", () => {
    it("purges all entries", () => {
      const store = createTemplateStore(adaptCfg());
      store.register("a", { content: "x", merge: "replace" });
      store.clear();
      expect(store.size).toBe(0);
      expect(store.outstanding(new Set())).toEqual([]);
    });
  });

  describe("debugTemplateStore", () => {
    it("exposes the underlying map for assertions", () => {
      const store = createTemplateStore(adaptCfg());
      store.register("test", { content: "<p>x</p>", merge: "replace" });
      const d = debugTemplateStore(store);
      expect(d.has("test")).toBe(true);
      expect(d.get("test")?.content).toBe("<p>x</p>");
      expect(Array.from(d.keys())).toEqual(["test"]);
    });

    it("throws for an invalid store", () => {
      expect(() => debugTemplateStore({} as any)).toThrow("not a valid TemplateStore");
    });
  });
});
