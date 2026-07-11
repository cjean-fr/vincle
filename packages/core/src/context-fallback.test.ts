import { describe, it, expect, afterAll } from "bun:test";

import {
  context,
  setContext,
  useContext,
  withScope,
  resetContextStorage,
} from "./context.js";

describe("ALS fallback (no AsyncLocalStorage available)", () => {
  afterAll(() => {
    resetContextStorage(false);
  });

  it("basic context operations with fallback store", async () => {
    resetContextStorage(true);
    const Token = context<string>("test:fallback-basic");
    await withScope(async () => {
      setContext(Token, "fallback-value");
      expect(useContext(Token)).toBe("fallback-value");
    });
  });

  it("isolates concurrent scopes via save/restore chain", async () => {
    resetContextStorage(true);
    const Token = context<string>("test:fallback-concurrent");
    const results = await Promise.all([
      withScope(async () => {
        setContext(Token, "A");
        await new Promise((r) => setTimeout(r, 5));
        return useContext(Token);
      }),
      withScope(async () => {
        setContext(Token, "B");
        await Promise.resolve();
        return useContext(Token);
      }),
    ]);
    expect(results).toEqual(["A", "B"]);
  });

  it("snapshot and seed still work with fallback", async () => {
    resetContextStorage(true);
    const Token = context<string>("test:fallback-snapshot");
    await withScope(async () => {
      setContext(Token, "parent");
      const snap = new Map([[Token, "seeded"]]);
      await withScope(() => {
        expect(useContext(Token)).toBe("seeded");
      }, snap as any);
    });
  });

  it("propagates through async continuations with fallback", async () => {
    resetContextStorage(true);
    const Token = context<string>("test:fallback-async");
    await withScope(async () => {
      setContext(Token, "async-val");
      await new Promise((r) => setTimeout(r, 2));
      expect(useContext(Token)).toBe("async-val");
    });
  });
});
