import { raw } from "@vincle/core";
import { escapeAttr } from "@vincle/core/html";

import { createAdapter } from "./shared.js";

/**
 * ESI is CDN-level: the `<esi:include>` tags are resolved by an edge proxy, so
 * there is no live stream to a browser. `capabilities.streaming: false` says
 * so — `renderToStream` refuses it, `renderToStatic` (with `emitFragments`)
 * is the path for ESI output.
 */
export const EsiAdapter = createAdapter({
  capabilities: { streaming: false, merges: ["replace"] },

  Placeholder: ({ src, children }) => {
    if (src) {
      return <>{raw(`<esi:include src="${escapeAttr(src)}" />`)}</>;
    }
    return <>{children}</>;
  },

  // `id` is escaped for the same reason `src` is above. It happens to be safe
  // today — `nextId()` builds it from a counter and `config.idPrefix` — but that
  // makes it safe by where it comes from, not by what happens to it, and this
  // was the only attribute in the repo whose escaping depended on the former.
  Patch: ({ id, children }) => (
    <>
      {raw(`<esi:inline name="${escapeAttr(id)}" fetchable="yes">`)}
      {children}
      {raw(`</esi:inline>`)}
    </>
  ),

  Frame: ({ children }) => <>{children}</>,
});
