import type { FlowEvent } from "../types.js";
import { createAdapter } from "./shared.js";
import { escapeAttr } from "@vincle/core/html";
import { raw, type VincleNode } from "@vincle/core";

export const EsiAdapter = createAdapter({
  capabilities: { streaming: false, merges: ["replace"] },

  Placeholder: ({ src, children }) => {
    if (src) {
      return raw(`<esi:include src="${escapeAttr(src)}" />`);
    }
    return children;
  },

  Patch: ({ id, children }) => {
    return [
      raw(`<esi:inline name="${id}" fetchable="yes">`),
      children,
      raw(`</esi:inline>`),
    ] as VincleNode;
  },

  Frame: ({ children }) => children,

  encode(): TransformStream<FlowEvent, string> {
    throw new Error(
      "EsiAdapter.encode() is not supported — ESI is CDN-level. Use renderToStatic with emitFragments instead.",
    );
  },
});
