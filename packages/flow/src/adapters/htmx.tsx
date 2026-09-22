import type { MergeType } from "../types.js";

import { createAdapter } from "./shared.js";

// Every value here is a valid `hx-swap` from htmx 2 on, except `outerMorph`,
// which htmx 4 introduced: `merge="morph"` needs htmx >= 4 on the client.
const SWAP: Record<MergeType, string> = {
  replace: "outerHTML",
  append: "beforeend",
  prepend: "afterbegin",
  before: "beforebegin",
  after: "afterend",
  morph: "outerMorph",
};

export const HtmxAdapter = createAdapter({
  Placeholder: function ({ id, src, children }) {
    return src ? (
      <div id={id} hx-get={src} hx-trigger="load" hx-swap="outerHTML">
        {children}
      </div>
    ) : (
      <div id={id}>{children}</div>
    );
  },

  Patch: ({ id, children, merge }) => (
    <div id={id} hx-swap-oob={SWAP[merge]}>
      {children}
    </div>
  ),

  Frame: ({ id, children }) => <div id={id}>{children}</div>,
});
