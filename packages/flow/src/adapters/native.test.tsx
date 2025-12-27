import { renderToString } from "@vincle/core";
import { describe, it, expect } from "bun:test";

import type { ShellContext } from "../adapters/shared.js";
import type { FlowConfig } from "../types.js";

import {
  NativeAdapter,
  NATIVE_POLYFILL,
  nativePolyfillHash,
  WebPlatformAdapter,
} from "../adapters/index.js";
import { createTemplateStore } from "../template-store.js";

const ctxWith = (size: number): ShellContext => ({ templateStore: { size } });

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

/**
 * Both adapters share the same `Patch`, so the same markup. What sets them
 * apart is what that markup **produces**: `data-merge` is only read by the
 * polyfill. Declaring all five merges on both sides made the registry accept
 * an `append` that the pure spec silently ignores — a missing fragment, no
 * error, which is exactly what the rest of the package refuses on principle.
 *
 * The README always said so ("`replace` only"); it was the code that promised
 * otherwise. These tests pin the promise to the side that actually delivers it.
 */
describe("merge capabilities: the pure spec and the polyfill diverge", () => {
  const storeFor = (adapter: FlowConfig["adapter"]) =>
    createTemplateStore({
      mode: "static",
      generatePath: (id: string) => `/fragments/${id}`,
      adapter,
    } as FlowConfig);

  it("WebPlatformAdapter declares only replace — nothing else works without JS", () => {
    expect(WebPlatformAdapter.capabilities.merges).toEqual(["replace"]);
  });

  it("the polyfill adds the other four, and NativeAdapter declares them", () => {
    expect([...NativeAdapter.capabilities.merges].toSorted()).toEqual([
      ...(["after", "append", "before", "prepend", "replace"] as const),
    ]);
  });

  it("withPolyfill preserves streaming rather than reasserting it", () => {
    expect(NativeAdapter.capabilities.streaming).toBe(WebPlatformAdapter.capabilities.streaming);
  });

  it("the registry refuses a merge the pure spec can't apply", () => {
    expect(() =>
      storeFor(WebPlatformAdapter).register("x", { content: "c", merge: "append" }),
    ).toThrow(/merge="append" is not supported/);
  });

  it("…and accepts it once the polyfill is present", () => {
    expect(() =>
      storeFor(NativeAdapter).register("x", { content: "c", merge: "append" }),
    ).not.toThrow();
  });

  it("replace stays accepted by both", () => {
    for (const adapter of [WebPlatformAdapter, NativeAdapter]) {
      expect(() =>
        storeFor(adapter).register("x", { content: "c", merge: "replace" }),
      ).not.toThrow();
    }
  });
});
