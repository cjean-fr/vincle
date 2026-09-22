import { expect, describe, it, beforeEach, afterAll } from "bun:test";

import type { ScopeMap } from "./scope.js";

import { resetContextStorage, resetNamedContexts, Scope, SyncContextStore } from "./scope.js";

const UserToken = Scope.key<{ name: string }>("test:user");
const PluginToken = Scope.key<{ items: string[] }>("test:plugin");

describe("Scope", () => {
  it("exposes the same scoped behavior through Scope", async () => {
    const key = Scope.key<string>("test:execution-api");
    await Scope.with(() => {
      Scope.set(key, "value");
      expect(Scope.get(key)).toBe("value");
      expect(Scope.snapshot().get(key)).toBe("value");
    });
  });
  describe("Scope.get / Scope.set", () => {
    beforeEach(() => resetContextStorage());

    it("throws outside Scope.with, naming the call that needs a scope", () => {
      expect(() => Scope.get(UserToken)).toThrow(
        "[vincle/core] Scope.get: no active context scope",
      );
      expect(() => Scope.set(UserToken, { name: "x" })).toThrow(
        "[vincle/core] Scope.set: no active context scope",
      );
    });

    it("throws when context not found in scope, naming the key", async () => {
      await Scope.with(() => {
        expect(() => Scope.get(UserToken)).toThrow(
          '[vincle/core] Scope.get("test:user"): the value was never set in the current scope',
        );
      });
    });

    it("reads back what was written", async () => {
      await Scope.with(() => {
        Scope.set(UserToken, { name: "Alice" });
        expect(Scope.get(UserToken)).toEqual({ name: "Alice" });
      });
    });

    it("propagates through async continuations", async () => {
      await Scope.with(async () => {
        Scope.set(UserToken, { name: "Bob" });
        await new Promise((r) => setTimeout(r, 5));
        expect(Scope.get(UserToken).name).toBe("Bob");
      });
    });

    it("mutations persist within same scope", async () => {
      await Scope.with(async () => {
        Scope.set(UserToken, { name: "Alice" });
        await Promise.resolve();
        Scope.get(UserToken).name = "Alice Updated";
        await Promise.resolve();
        expect(Scope.get(UserToken).name).toBe("Alice Updated");
      });
    });
  });

  describe("Scope.with", () => {
    it("handles many concurrent scopes (race on ensureStorage)", async () => {
      const Token = Scope.key<number>("test:concurrent-ensure");
      const count = 20;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          Scope.with(async () => {
            Scope.set(Token, i);
            await Promise.resolve();
            return Scope.get(Token);
          }),
        ),
      );
      expect(results).toEqual(Array.from({ length: count }, (_, i) => i));
    });

    it("isolates concurrent scopes", async () => {
      const results = await Promise.all([
        Scope.with(async () => {
          Scope.set(UserToken, { name: "A" });
          await new Promise((r) => setTimeout(r, 10));
          return Scope.get(UserToken).name;
        }),
        Scope.with(async () => {
          Scope.set(UserToken, { name: "B" });
          await Promise.resolve();
          return Scope.get(UserToken).name;
        }),
      ]);
      expect(results).toEqual(["A", "B"]);
    });

    it("returns callback result", async () => {
      const result = await Scope.with(() => 42);
      expect(result).toBe(42);
    });

    it("sub-scope is empty without seed", async () => {
      await Scope.with(async () => {
        Scope.set(UserToken, { name: "Parent" });
        await Scope.with(() => {
          expect(() => Scope.get(UserToken)).toThrow(/never set in the current scope/);
        });
      });
    });
  });

  describe("snapshot / seed", () => {
    it("seed pre-fills sub-scope", async () => {
      await Scope.with(async () => {
        Scope.set(UserToken, { name: "Parent" });
        const seed = Scope.snapshot();

        await Scope.with(() => {
          expect(Scope.get(UserToken).name).toBe("Parent");
        }, seed);
      });
    });

    it("child mutation does not affect parent", async () => {
      await Scope.with(async () => {
        Scope.set(UserToken, { name: "Parent" });
        const seed = Scope.snapshot();

        await Scope.with(() => {
          Scope.set(UserToken, { name: "Child" });
          expect(Scope.get(UserToken).name).toBe("Child");
        }, seed);

        expect(Scope.get(UserToken).name).toBe("Parent");
      });
    });

    it("Scope.snapshot throws outside Scope.with", () => {
      resetContextStorage();
      expect(() => Scope.snapshot()).toThrow(
        "[vincle/core] Scope.snapshot: no active context scope",
      );
    });
  });

  describe("inter-plugin communication", () => {
    it("plugins share same scope", async () => {
      await Scope.with(() => {
        Scope.set(UserToken, { name: "Alice" });
        Scope.set(PluginToken, { items: [] });

        Scope.get(PluginToken).items.push(Scope.get(UserToken).name);

        expect(Scope.get(PluginToken).items).toEqual(["Alice"]);
      });
    });
  });

  describe("Scope.key(name)", () => {
    it("same key returns the same Symbol within one instance", () => {
      const a = Scope.key<string>("test:demo");
      const b = Scope.key<string>("test:demo");
      expect(a).toBe(b);
    });

    it("different keys return different Symbols", () => {
      const a = Scope.key<string>("test:x");
      const b = Scope.key<string>("test:y");
      expect(a).not.toBe(b);
    });

    it("rejects empty or non-string keys", () => {
      expect(() => Scope.key<string>("")).toThrow(/non-empty string key/);
      // @ts-expect-error: intentionally wrong type at runtime
      expect(() => Scope.key<string>(123)).toThrow(/non-empty string key/);
      // @ts-expect-error: intentionally wrong type at runtime
      expect(() => Scope.key<string>()).toThrow(/non-empty string key/);
    });

    it("works with Scope.set/Scope.get inside a scope", async () => {
      const Shared = Scope.key<{ value: number }>("test:in-scope");
      await Scope.with(() => {
        Scope.set(Shared, { value: 42 });
        expect(Scope.get(Shared).value).toBe(42);
      });
    });
  });

  describe("createContextStore: alternate ALS sources", () => {
    const OrigALS = (globalThis as any).AsyncLocalStorage;

    class MockALS {
      #store: ScopeMap | undefined;
      run<T>(ctx: ScopeMap, fn: () => T): Promise<T> {
        const prev = this.#store;
        this.#store = ctx;
        try {
          const result = fn();
          if (result instanceof Promise)
            return result.finally(() => {
              this.#store = prev;
            }) as Promise<T>;
          this.#store = prev;
          return Promise.resolve(result);
        } catch (e) {
          this.#store = prev;
          throw e;
        }
      }
      getStore(): ScopeMap | undefined {
        return this.#store;
      }
    }

    afterAll(() => {
      (globalThis as any).AsyncLocalStorage = OrigALS;
      resetContextStorage();
    });

    it("uses globalThis.AsyncLocalStorage when available", async () => {
      (globalThis as any).AsyncLocalStorage = MockALS;
      resetContextStorage();

      const Token = Scope.key<string>("test:global-als");
      await Scope.with(async () => {
        Scope.set(Token, "via-global-als");
        expect(Scope.get(Token)).toBe("via-global-als");
      });
    });
  });

  // ── Synchronous fallback ──────────────────────────────────────────────────
  //
  // GOAL promises a fallback that is "correct: never silent" where
  // `AsyncLocalStorage` doesn't exist. It can't be reached through
  // `ensureStore` here (bun *has* ALS), so it's the class that's tested
  // directly: it's the one carrying the guarantee.

  describe("SyncContextStore: fallback without AsyncLocalStorage", () => {
    it("carries a synchronous scope", () => {
      const store = new SyncContextStore();
      const ctx: ScopeMap = new Map();
      expect(store.getStore()).toBeUndefined();
      const seen = store.run(ctx, () => store.getStore());
      expect(seen).toBe(ctx);
      // Closed behind it.
      expect(store.getStore()).toBeUndefined();
    });

    it("holds the scope across an await, then closes it", async () => {
      const store = new SyncContextStore();
      const ctx: ScopeMap = new Map();

      const result = await store.run(ctx, async () => {
        await new Promise((r) => setTimeout(r, 5));
        // That's the whole point: after the await, the scope is still there.
        return store.getStore();
      });

      expect(result).toBe(ctx);
      expect(store.getStore()).toBeUndefined();
    });

    it("allows synchronous nesting and restores the parent", () => {
      const store = new SyncContextStore();
      const parent: ScopeMap = new Map();
      const child: ScopeMap = new Map();

      store.run(parent, () => {
        store.run(child, () => {
          expect(store.getStore()).toBe(child);
        });
        expect(store.getStore()).toBe(parent);
      });
    });

    it("refuses two overlapping scopes rather than mixing them", async () => {
      const store = new SyncContextStore();
      const first = store.run(new Map(), () => new Promise((r) => setTimeout(r, 10)));

      // The first scope is still in flight: there's no way to tell whether
      // this one is a nested child or a second request. So it's refused.
      expect(() => store.run(new Map(), () => "second")).toThrow(
        /another scope was still awaiting/,
      );

      await first;
      // Once the first one has settled, the store is reusable again.
      expect(store.run(new Map(), () => "ok")).toBe("ok");
    });

    it("closes the scope both when fn throws and when the promise rejects", async () => {
      const store = new SyncContextStore();

      expect(() =>
        store.run(new Map(), () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
      expect(store.getStore()).toBeUndefined();

      await expect(
        store.run(new Map(), () => Promise.reject(new Error("async boom"))),
      ).rejects.toThrow("async boom");
      expect(store.getStore()).toBeUndefined();
      // …and overlapping is allowed again: `#pending` has fallen back to false.
      expect(store.run(new Map(), () => "ok")).toBe("ok");
    });
  });

  describe("context(key): leak guard", () => {
    afterAll(() => resetNamedContexts());

    it("keeps the key → symbol identity, and refuses a key built per request", () => {
      // The cap can't just stop memoizing: that would make
      // `context(k) !== context(k)` silently true. It throws instead.
      const before = Scope.key<string>("test:identity");
      expect(Scope.key<string>("test:identity")).toBe(before);

      expect(() => {
        for (let i = 0; i < 10_001; i++) Scope.key<number>(`test:leak:${i}`);
      }).toThrow(/Context keys are module-level constants/);
    });
  });
});
