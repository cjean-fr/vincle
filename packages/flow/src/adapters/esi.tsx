import { raw, type VNode } from "@vincle/core";
import { escapeAttr } from "@vincle/core/html";

import type { FlowEvent } from "../types.js";

import { createAdapter } from "./shared.js";

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
    ] as VNode;
  },

  Frame: ({ children }) => children,

  encode(): TransformStream<FlowEvent, string> {
    throw new Error(
      "EsiAdapter.encode() is not supported — ESI is CDN-level. Use renderToStatic with emitFragments instead.",
    );
  },
});
