import { describe, expect, it } from "bun:test";

import { injectLiveReload, LIVE_RELOAD_PATH, liveReloadResponse } from "./live-reload.js";

describe("development live reload", () => {
  it("adds a same-origin external script without altering the CSP or existing scripts", () => {
    const head = `<head><meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-theme'"><script>theme()</script></head>`;
    const html = `${head}<body><main>Documentation</main></body>`;
    const injected = injectLiveReload(html);

    expect(injected).toStartWith(head);
    expect(injected).toContain(`<script src="${LIVE_RELOAD_PATH}"></script>\n</body>`);
    expect([...injected.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])).toEqual([
      "theme()",
    ]);
  });

  it("leaves documents without a body closing tag untouched", () => {
    expect(injectLiveReload("<main>Fragment</main>")).toBe("<main>Fragment</main>");
  });

  it("serves executable JavaScript with the correct MIME type and no caching", async () => {
    const response = liveReloadResponse();
    expect(response.headers.get("Content-Type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const awaitedSource = await response.text();
    expect(() => new Function(awaitedSource)).not.toThrow();
  });
});
