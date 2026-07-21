import { describe, it, expect } from "bun:test";

import type { FlowContext } from "./context.js";

import { createAdapter, NativeAdapter, TurboAdapter } from "./adapters/index.js";
import { renderToStream, Template } from "./index.js";
import { collect } from "./test-utils.js";
import { composeShell, injectIntoHead } from "./utils.js";

// These transforms ignore the ctx; pass a stub to satisfy the signature.
const CTX = { templateStore: { size: 0 } } as unknown as FlowContext;

describe("composeShell", () => {
  it("applies transforms left-to-right", () => {
    const t = composeShell(
      (s) => s + "[a]",
      (s) => s + "[b]",
    );
    expect(t("x", CTX)).toBe("x[a][b]");
  });

  it("skips falsy entries (e.g. an adapter with no transformShell)", () => {
    const t = composeShell(
      undefined,
      TurboAdapter.transformShell,
      (s) => injectIntoHead(s, "<title>ok</title>"),
      null,
      false,
    );
    expect(t("<head></head>", CTX)).toBe("<head><title>ok</title></head>");
  });

  it("composes into an adapter and runs once in the streamed shell", async () => {
    const metadata = () => (s: string) => injectIntoHead(s, "<title>Home</title>");
    const adapter = createAdapter({
      ...NativeAdapter,
      transformShell: composeShell(NativeAdapter.transformShell, metadata()),
    });
    const html = await collect(
      renderToStream(
        () => (
          <html>
            <head></head>
            <body>
              <Template target="d"><span>d</span></Template>
            </body>
          </html>
        ),
        adapter,
      ),
    );
    expect(html).toContain("<title>Home</title>");
    expect(html).toContain("MutationObserver");
    expect(html.match(/<title>Home<\/title>/g)).toHaveLength(1);
  });
});
