import {
  context,
  setContext,
  useContext,
  withScope,
  snapshot,
  resetContextStorage,
} from "./context.js";
import { expect, describe, it, beforeEach } from "bun:test";

const UserToken = context<{ name: string }>("test:user");
const PluginToken = context<{ items: string[] }>("test:plugin");

describe("context", () => {
  describe("useContext / setContext", () => {
    beforeEach(() => resetContextStorage());

    it("throws outside withScope", () => {
      expect(() => useContext(UserToken)).toThrow(
        "[vincle/core] useContext() called outside of a withScope() scope.",
      );
      expect(() => setContext(UserToken, { name: "x" })).toThrow(
        "[vincle/core] setContext() called outside of a withScope() scope.",
      );
    });

    it("throws when context not found in scope", async () => {
      await withScope(() => {
        expect(() => useContext(UserToken)).toThrow(
          "[vincle/core] useContext() — context not found in current scope.",
        );
      });
    });

    it("reads back what was written", async () => {
      await withScope(() => {
        setContext(UserToken, { name: "Alice" });
        expect(useContext(UserToken)).toEqual({ name: "Alice" });
      });
    });

    it("propagates through async continuations", async () => {
      await withScope(async () => {
        setContext(UserToken, { name: "Bob" });
        await new Promise((r) => setTimeout(r, 5));
        expect(useContext(UserToken).name).toBe("Bob");
      });
    });

    it("mutations persist within same scope", async () => {
      await withScope(async () => {
        setContext(UserToken, { name: "Alice" });
        await Promise.resolve();
        useContext(UserToken).name = "Alice Updated";
        await Promise.resolve();
        expect(useContext(UserToken).name).toBe("Alice Updated");
      });
    });
  });

  describe("withScope", () => {
    it("handles many concurrent scopes (race on ensureStorage)", async () => {
      const Token = context<number>("test:concurrent-ensure");
      const count = 20;
      const results = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          withScope(async () => {
            setContext(Token, i);
            await Promise.resolve();
            return useContext(Token);
          }),
        ),
      );
      expect(results).toEqual(Array.from({ length: count }, (_, i) => i));
    });

    it("isolates concurrent scopes", async () => {
      const results = await Promise.all([
        withScope(async () => {
          setContext(UserToken, { name: "A" });
          await new Promise((r) => setTimeout(r, 10));
          return useContext(UserToken).name;
        }),
        withScope(async () => {
          setContext(UserToken, { name: "B" });
          await Promise.resolve();
          return useContext(UserToken).name;
        }),
      ]);
      expect(results).toEqual(["A", "B"]);
    });

    it("returns callback result", async () => {
      const result = await withScope(() => 42);
      expect(result).toBe(42);
    });

    it("sub-scope is empty without seed", async () => {
      await withScope(async () => {
        setContext(UserToken, { name: "Parent" });
        await withScope(() => {
          expect(() => useContext(UserToken)).toThrow(
            "not found in current scope",
          );
        });
      });
    });
  });

  describe("snapshot / seed", () => {
    it("seed pre-fills sub-scope", async () => {
      await withScope(async () => {
        setContext(UserToken, { name: "Parent" });
        const seed = snapshot();

        await withScope(
          () => {
            expect(useContext(UserToken).name).toBe("Parent");
          },
          { seed },
        );
      });
    });

    it("child mutation does not affect parent", async () => {
      await withScope(async () => {
        setContext(UserToken, { name: "Parent" });
        const seed = snapshot();

        await withScope(
          () => {
            setContext(UserToken, { name: "Child" });
            expect(useContext(UserToken).name).toBe("Child");
          },
          { seed },
        );

        expect(useContext(UserToken).name).toBe("Parent");
      });
    });

    it("snapshot throws outside withScope", () => {
      resetContextStorage();
      expect(() => snapshot()).toThrow(
        "[vincle/core] snapshot() called outside of a withScope() scope.",
      );
    });
  });

  describe("inter-plugin communication", () => {
    it("plugins share same scope", async () => {
      await withScope(() => {
        setContext(UserToken, { name: "Alice" });
        setContext(PluginToken, { items: [] });

        useContext(PluginToken).items.push(useContext(UserToken).name);

        expect(useContext(PluginToken).items).toEqual(["Alice"]);
      });
    });
  });

  describe("context(key)", () => {
    it("same key returns the same Symbol within one instance", () => {
      const a = context<string>("test:demo");
      const b = context<string>("test:demo");
      expect(a).toBe(b);
    });

    it("different keys return different Symbols", () => {
      const a = context<string>("test:x");
      const b = context<string>("test:y");
      expect(a).not.toBe(b);
    });

    it("rejects empty or non-string keys", () => {
      expect(() => context<string>("")).toThrow(/non-empty string key/);
      // @ts-expect-error — intentionally wrong type at runtime
      expect(() => context<string>(123)).toThrow(/non-empty string key/);
      // @ts-expect-error — intentionally wrong type at runtime
      expect(() => context<string>()).toThrow(/non-empty string key/);
    });

    it("works with setContext/useContext inside a scope", async () => {
      const Shared = context<{ value: number }>("test:in-scope");
      await withScope(() => {
        setContext(Shared, { value: 42 });
        expect(useContext(Shared).value).toBe(42);
      });
    });
  });
});
