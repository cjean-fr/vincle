import { renderToString, withScope } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import { TurboAdapter } from "../adapters/index.js";
import { initFlow } from "../context.js";
import { Include } from "../index.js";
import { renderToStream } from "../render.js";
import { collect } from "../test-utils.js";

describe("Include", () => {
  it("renders a placeholder pointing at src, registers nothing", async () => {
    const html = await collect(renderToStream(() => <Include src="/api/fragment" />, TurboAdapter));
    expect(html).toContain('src="/api/fragment"');
    // "No registration" means no patch ever gets drained for it.
    expect(html).not.toContain("<turbo-stream");
  });

  it("still accepts a dynamic string src (checked at runtime, not compile time)", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      const dynamic: string = "/api/" + Math.random().toString(36).slice(2);
      const html = await renderToString(<Include src={dynamic} />);
      expect(html).toContain(dynamic);
    });
  });

  it("throws at runtime for invalid dynamic strings", async () => {
    await withScope(async () => {
      initFlow({ adapter: TurboAdapter, mode: "streaming" });
      await expect(
        renderToString(<Include src={"javascript:alert(1)" as string} />),
      ).rejects.toThrow(/forbidden scheme/);
    });
  });

  // The scheme question is `schemeOf`'s, and these are the cases the private
  // re-implementation got wrong before it delegated.
  describe("scheme detection follows the WHATWG parser", () => {
    const check = (src: string): Promise<string> =>
      withScope(async () => {
        initFlow({ adapter: TurboAdapter, mode: "streaming" });
        return renderToString(<Include src={src as string} />);
      });

    it("sees through tabs and control characters in the scheme", async () => {
      // A browser strips these before parsing, so it reads `javascript:`.
      await expect(check("java\tscript:alert(1)")).rejects.toThrow(/forbidden scheme/);
      await expect(check("\0javascript:alert(1)")).rejects.toThrow(/forbidden scheme/);
    });

    it("does not mistake a query-only relative reference for a scheme", async () => {
      // `?` ends any scheme candidate: `?a:b` carries no scheme at all. The old
      // hand-rolled check looked for `?` after the colon and rejected this.
      expect(await check("?a:b")).toContain("?a:b");
      expect(await check("#a:b")).toContain("#a:b");
      expect(await check("/path:with:colons")).toContain("/path:with:colons");
    });

    it("still accepts http(s) in any casing", async () => {
      expect(await check("HTTPS://example.test/f")).toContain("HTTPS://example.test/f");
    });
  });
});
