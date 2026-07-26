import { raw, type VNode } from "@vincle/core";
import { escapeAttr } from "@vincle/core/html";

import type { FlowEvent } from "../types.js";

import { createAdapter } from "./shared.js";

export const EsiAdapter = createAdapter({
  capabilities: { streaming: false, merges: ["replace"] },

  Placeholder: ({ src, children }) => {
    if (src) {
      return raw(`<esi:include src="${escapeAttr(src)}" />`) as unknown as VNode;
    }
    return children as VNode;
  },

  Patch: ({ id, children }) => (
    <>
      {raw(`<esi:inline name="${id}" fetchable="yes">`)}
      {children}
      {raw(`</esi:inline>`)}
    </>
  ),

  Frame: ({ children }) => children as VNode,

  encode(): TransformStream<FlowEvent, string> {
    throw new Error(
      "EsiAdapter.encode() is not supported — ESI is CDN-level. Use renderToStatic with emitFragments instead.",
    );
  },
});
