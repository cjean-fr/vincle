import { raw, renderToString, type JSX } from "@vincle/core";
import { escapeAttr } from "@vincle/core/html";

import { injectIntoHead } from "../utils.js";
import { NATIVE_POLYFILL } from "./native-polyfill.js";
import { prepareNativeTemplates } from "./native-shell.js";
import { createAdapter, type Adapter } from "./shared.js";

export { NATIVE_POLYFILL, nativePolyfillHash } from "./native-polyfill.js";

/**
 * WICG Declarative Partial Updates wire format: no polyfill, zero JS.
 *
 * `merges: ["replace"]` only: `Patch` can write `data-merge`, but nothing reads
 * it without a polyfill, and declaring the others would accept a merge the
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
          <template for={id} src={src} />
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
      return <template for={id}>{children}</template>;
    }
    return (
      <template for={id} data-merge={merge}>
        {children}
      </template>
    );
  },

  // A fetched include is raw markup, not another inert patch template.
  Frame: ({ children }) => <>{children}</>,
});

/**
 * What the polyfill can express: `insertAdjacentHTML`'s four positions, plus
 * `replace`. `morph` is out: diffing two DOM trees is orders of magnitude past
 * this budget, so the adapter refuses it rather than degrading it to a replace.
 */
const POLYFILL_MERGES = ["replace", "append", "prepend", "before", "after"] as const;

/**
 * Decorate a WICG-format adapter with the inline polyfill. Its templates use
 * `data-for` so partially implemented native patching cannot consume them first.
 * The polyfill is injected when fragments or active templates are present.
 *
 * Useful when you want to use `WebPlatformAdapter` in browsers that do
 * not yet support `<template for>` natively.
 */
export function withPolyfill<T extends Adapter>(
  adapter: T,
): Omit<T, "capabilities"> & {
  // `streaming` kept literal so `renderToStream` can still refuse a
  // non-streamable adapter at compile time: widening to `boolean` here would
  // lose that refusal for every decorated adapter.
  capabilities: { streaming: T["capabilities"]["streaming"]; merges: typeof POLYFILL_MERGES };
} {
  const markup = async (node: JSX.Element) =>
    raw(prepareNativeTemplates(await renderToString(node)).html);
  return {
    ...adapter,
    Placeholder: (props) => markup(adapter.Placeholder(props)),
    Patch: (props) => markup(adapter.Patch(props)),
    Frame: (props) => markup(adapter.Frame(props)),
    // The polyfill reads `data-merge` and translates it to `insertAdjacentHTML`
    //: exactly what the pure spec lacks, so those merges become real here.
    capabilities: { streaming: adapter.capabilities.streaming, merges: POLYFILL_MERGES },
    transformShell: (shell, ctx) => {
      const transformed = adapter.transformShell ? adapter.transformShell(shell, ctx) : shell;
      const prepared = prepareNativeTemplates(transformed);
      if (ctx.fragments.size === 0 && !prepared.active) return transformed;
      return injectIntoHead(prepared.html, String(<script>{NATIVE_POLYFILL}</script>));
    },
  };
}

/** Default Native adapter: WICG format + inline polyfill. */
export const NativeAdapter = withPolyfill(WebPlatformAdapter);
