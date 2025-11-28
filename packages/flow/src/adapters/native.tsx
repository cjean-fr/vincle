import { raw } from "@vincle/core";
import { escapeAttr } from "@vincle/core/html";

import { injectIntoHead } from "../utils.js";
import { POLYFILL_SCRIPT } from "./native-polyfill.js";
import { ALL_MERGES, createAdapter, type Adapter } from "./shared.js";

export { NATIVE_POLYFILL, nativePolyfillHash } from "./native-polyfill.js";

/**
 * WICG Declarative Partial Updates wire format — no polyfill, zero JS.
 *
 * `merges: ["replace"]` only: `Patch` can write `data-merge`, but nothing reads
 * it without a polyfill, and declaring the other four would accept a merge the
 * spec silently ignores. `withPolyfill` is what makes them real, so it's the
 * one that declares them.
 */
export const WebPlatformAdapter = createAdapter({
  capabilities: { streaming: true, merges: ["replace"] },
  Placeholder: function ({ id, src, children }) {
    const safeId = escapeAttr(id);
    if (src) {
      return (
        <>
          {raw(`<?start name="${safeId}">`)}
          {children}
          {raw(`<?end>`)}
          <template htmlFor={id} data-src={src} />
        </>
      );
    }
    return (
      <>
        {raw(`<?start name="${safeId}">`)}
        {children}
        {raw(`<?end>`)}
      </>
    );
  },

  Patch: ({ id, children, merge }) => {
    if (merge === "replace") {
      return <template htmlFor={id}>{children}</template>;
    }
    return (
      <template htmlFor={id} data-merge={merge}>
        {children}
      </template>
    );
  },

  Frame: ({ id, children }) => <template htmlFor={id}>{children}</template>,
});

/**
 * Decorate any adapter with the ~550 B inline polyfill for the WICG
 * Declarative Partial Updates API. The polyfill is injected into `<head>`
 * only when fragments are present (`ctx.templateStore.size > 0`).
 *
 * Useful when you want to use `WebPlatformAdapter` in browsers that do
 * not yet support `<template for>` natively.
 */
export function withPolyfill<T extends Adapter>(
  adapter: T,
): Omit<T, "capabilities"> & {
  // `streaming` kept literal so `renderToStream` can still refuse a
  // non-streamable adapter at compile time — widening to `boolean` here would
  // lose that refusal for every decorated adapter.
  capabilities: { streaming: T["capabilities"]["streaming"]; merges: typeof ALL_MERGES };
} {
  return {
    ...adapter,
    // The polyfill reads `data-merge` and translates it to `insertAdjacentHTML`
    // — exactly what the pure spec lacks — so the capability becomes true here.
    capabilities: { streaming: adapter.capabilities.streaming, merges: ALL_MERGES },
    transformShell: (shell, ctx) => {
      const transformed = adapter.transformShell ? adapter.transformShell(shell, ctx) : shell;
      if (ctx.templateStore.size === 0) return transformed;
      return injectIntoHead(transformed, POLYFILL_SCRIPT);
    },
  };
}

/** Default Native adapter — WICG format + inline polyfill (~550 B). */
export const NativeAdapter = withPolyfill(WebPlatformAdapter);
