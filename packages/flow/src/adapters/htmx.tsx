import type { MergeType } from "../types.js";

import { createAdapter } from "./shared.js";

// Every value here is a valid `hx-swap` from htmx 2 on, except `outerMorph`,
// which htmx 4 introduced: `merge="morph"` needs htmx >= 4 on the client.
const SWAP: Record<MergeType, string> = {
  replace: "outerHTML",
  update: "innerHTML",
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

  Patch: ({ id, children, merge, first }) => {
    // `replace` and `morph` define the placeholder's content instead of
    // inserting beside it (`morph` is a *how*, not a *where*: what becomes of
    // the fallback is the client's reconciliation), so the fallback goes with
    // them. It is the positioned swaps below that would leave it standing.
    if (!first || merge === "replace" || merge === "morph") {
      return (
        <div id={id} hx-swap-oob={SWAP[merge]}>
          {children}
        </div>
      );
    }
    // The fallback *is* the placeholder's content, so replacing it is what makes
    // the placeholder's promise real. For `update`/`append`/`prepend` that replacement
    // is the insert itself: the boundary is empty once the fallback is gone.
    if (merge === "update" || merge === "append" || merge === "prepend") {
      return (
        <div id={id} hx-swap-oob="innerHTML">
          {children}
        </div>
      );
    }
    // `before`/`after` insert outside the placeholder, so they empty it first,
    // then place the content around what is left.
    return (
      <>
        <div id={id} hx-swap-oob="innerHTML" />
        <div id={id} hx-swap-oob={SWAP[merge]}>
          {children}
        </div>
      </>
    );
  },

  Frame: ({ id, children }) => <div id={id}>{children}</div>,
});
