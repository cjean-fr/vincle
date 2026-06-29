import type { MergeType } from "../types.js";
import { createAdapter } from "./shared.js";

const SWAP: Record<MergeType, string> = {
  replace: "outerHTML",
  append: "beforeend",
  prepend: "afterbegin",
  before: "beforebegin",
  after: "afterend",
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
