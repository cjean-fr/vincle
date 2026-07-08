import { injectIntoHead } from "../utils.js";
import { createAdapter, type Adapter } from "./shared.js";
import { raw, renderToString, type VincleNode } from "@vincle/core";
import { escapeAttr } from "@vincle/core/html";
import { NATIVE_POLYFILL } from "./native-polyfill.js";

export { NATIVE_POLYFILL, nativePolyfillHash } from "./native-polyfill.js";

/** WICG Declarative Partial Updates wire format — no polyfill, zero JS. */
export const WebPlatformAdapter = createAdapter({
  Placeholder: function ({ id, src, children }) {
    const safeId = escapeAttr(id);
    const open: VincleNode = raw(`<?start name="${safeId}">`);
    const close: VincleNode = raw(`<?end>`);
    if (src) {
      return [open, children, close, <template htmlFor={id} data-src={src} />];
    }
    return [open, children, close];
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
 * only when fragments are present (`ctx.pendingStore.size > 0`).
 *
 * Useful when you want to use `WebPlatformAdapter` in browsers that do
 * not yet support `<template for>` natively.
 */
export function withPolyfill<T extends Adapter>(adapter: T): T {
  return {
    ...adapter,
    transformShell: async (shell, ctx) => {
      const transformed = adapter.transformShell
        ? await adapter.transformShell(shell, ctx)
        : shell;
      if (ctx.pendingStore.size === 0) return transformed;
      const script = <script>{NATIVE_POLYFILL}</script>;
      return injectIntoHead(
        transformed,
        await renderToString(script),
      );
    },
  } as T;
}

/** Default Native adapter — WICG format + inline polyfill (~550 B). */
export const NativeAdapter = withPolyfill(WebPlatformAdapter);
