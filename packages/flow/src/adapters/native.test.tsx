import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import type { FlowContext } from "../context.js";

import { NativeAdapter, NATIVE_POLYFILL, nativePolyfillHash } from "../adapters/index.js";

const ctxWith = (size: number) => ({ templateStore: { size } }) as unknown as FlowContext;

describe("NativeAdapter", () => {
  it("patches are declarative templates — never per-fragment scripts (CSP)", async () => {
    const repl = await renderToString(
      NativeAdapter.Patch({ id: "x", children: "c", merge: "replace" }),
    );
    expect(repl).toContain('<template for="x">');
    expect(repl).not.toContain("data-merge");
    expect(repl).not.toContain("<script");

    const app = await renderToString(
      NativeAdapter.Patch({ id: "x", children: "c", merge: "append" }),
    );
    expect(app).toContain('<template for="x" data-merge="append">');
    expect(app).not.toContain("<script");
  });

  it("src placeholder is a declarative data-src template, not a fetch script (CSP)", async () => {
    const ph = await renderToString(
      NativeAdapter.Placeholder({ id: "x", src: "/api/frag", children: null }),
    );
    expect(ph).toContain('<template for="x" data-src="/api/frag">');
    expect(ph).not.toContain("<script");
    expect(ph).not.toContain("streamAppendHTML");
  });

  it("escapes a hostile src into the data-src attribute", async () => {
    const ph = await renderToString(
      NativeAdapter.Placeholder({
        id: "x",
        src: '"><script>alert(1)</script>',
        children: null,
      }),
    );
    expect(ph).not.toContain("<script>alert(1)");
    expect(ph).toContain("&quot;>&lt;script>");
  });

  it("exposes the polyfill source and a stable CSP hash for it", async () => {
    expect(NATIVE_POLYFILL).toContain("MutationObserver");
    const hash = await nativePolyfillHash();
    expect(hash).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
    expect(await nativePolyfillHash()).toBe(hash);
  });

  it("transformShell injects the polyfill when fragments are pending", () => {
    const result = NativeAdapter.transformShell!(
      "<html><head></head><body></body></html>",
      ctxWith(1),
    );
    expect(result).toContain(`<script>`);
    expect(result).toContain("MutationObserver");
    expect(result.indexOf("<script>")).toBeLessThan(result.indexOf("</head>"));
  });

  it("transformShell injects nothing when there are no fragments", () => {
    const shell = "<html><head></head><body></body></html>";
    expect(NativeAdapter.transformShell!(shell, ctxWith(0))).toBe(shell);
  });

  it("Frame renders <template>", async () => {
    expect(await renderToString(NativeAdapter.Frame({ id: "x", children: "c" }))).toContain(
      "template",
    );
  });
});
