import { describe, it, expect } from "bun:test";

import type { ShellContext } from "./adapters/shared.js";

import { createAdapter, NativeAdapter, TurboAdapter } from "./adapters/index.js";
import { renderToStream, Template } from "./index.js";
import { collect } from "./test-utils.js";
import { composeShell, injectIntoHead } from "./utils.js";

// These transforms ignore the ctx; a real ShellContext needs no stubbing.
const CTX: ShellContext = { templateStore: { size: 0 } };

describe("injectIntoHead", () => {
  const CONTENT = "<style>i{}</style>";

  it("inserts before </head> when the shell has one, in any casing", () => {
    expect(
      injectIntoHead("<html><head><title>t</title></head><body>x</body></html>", CONTENT),
    ).toBe("<html><head><title>t</title><style>i{}</style></head><body>x</body></html>");
    expect(injectIntoHead("<html><HEAD></HEAD><body>x</body></html>", CONTENT)).toBe(
      "<html><HEAD><style>i{}</style></HEAD><body>x</body></html>",
    );
  });

  it("opens a <head> right after <html> when there is none", () => {
    expect(injectIntoHead("<html><body>x</body></html>", CONTENT)).toBe(
      "<html><head><style>i{}</style></head><body>x</body></html>",
    );
  });

  // The regression: `startsWith("<html")` matched neither branch for a shell
  // opening with a doctype, so the head landed *before* it. Nothing may precede
  // a doctype — a browser that sees markup first renders in quirks mode.
  it("never places content before a doctype", () => {
    expect(injectIntoHead("<!doctype html><html><body>x</body></html>", CONTENT)).toBe(
      "<!doctype html><html><head><style>i{}</style></head><body>x</body></html>",
    );
    expect(injectIntoHead("<!DOCTYPE html>\n<html><body>x</body></html>", CONTENT)).toBe(
      "<!DOCTYPE html>\n<html><head><style>i{}</style></head><body>x</body></html>",
    );
    // A fragment shell that still declares a doctype and has no <html>.
    expect(injectIntoHead("<!doctype html><div>x</div>", CONTENT)).toBe(
      "<!doctype html><head><style>i{}</style></head><div>x</div>",
    );
  });

  it("prepends on a bare fragment — nothing to preserve", () => {
    expect(injectIntoHead("<div>x</div>", CONTENT)).toBe(
      "<head><style>i{}</style></head><div>x</div>",
    );
  });
});

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
              <Template target="d">
                <span>d</span>
              </Template>
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
