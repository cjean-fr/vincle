import { Flow, initFlow } from "../context.js";
import { ClientFetch } from "../index.js";
import { TurboAdapter } from "../adapters/index.js";
import { renderToString, withScope, useContext } from "@vincle/core";
import { describe, it, expect } from "bun:test";

describe("ClientFetch", () => {
  it("renders a placeholder pointing at src, registers nothing", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const html = await renderToString(<ClientFetch src="/api/fragment" />);
      expect(html).toContain('src="/api/fragment"');
      expect(useContext(Flow).pendingStore.size).toBe(0);
    });
  });

  it("still accepts a dynamic string src (checked at runtime, not compile time)", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const dynamic: string = "/api/" + Math.random().toString(36).slice(2);
      const html = await renderToString(<ClientFetch src={dynamic} />);
      expect(html).toContain(dynamic);
    });
  });

  it("throws at runtime for invalid dynamic strings", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      expect(() => (
        <ClientFetch src={"javascript:alert(1)" as string} />
      )).toThrow(/forbidden scheme/);
    });
  });
});
