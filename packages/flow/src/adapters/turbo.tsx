import type { MergeType } from "../types.js";

import { createAdapter } from "./shared.js";

// Every merge but `morph` is a Turbo Stream action of the same name. Turbo has
// no `morph` action: morphing is `method="morph"` layered on `replace`, which
// Turbo 8 added: `merge="morph"` needs Turbo >= 8 on the client.
const ACTION: Record<MergeType, string> = {
  replace: "replace",
  append: "append",
  prepend: "prepend",
  before: "before",
  after: "after",
  morph: "replace",
};

export const TurboAdapter = createAdapter({
  Placeholder: function ({ id, src, children }) {
    return src ? (
      <turbo-frame id={id} src={src}>
        {children}
      </turbo-frame>
    ) : (
      <turbo-frame id={id}>{children}</turbo-frame>
    );
  },

  Patch: ({ id, children, merge, first }) => {
    // `replace` and `morph` define the frame's content instead of inserting
    // beside it (`morph` is a *how*, not a *where*: Turbo answers it with a
    // morphing `replace`, which swaps the frame itself), so the fallback goes
    // with them. It is the positioned actions below that would leave it standing.
    if (!first || merge === "replace" || merge === "morph") {
      return (
        <turbo-stream
          action={ACTION[merge]}
          method={merge === "morph" ? "morph" : undefined}
          target={id}
        >
          <template>{children}</template>
        </turbo-stream>
      );
    }
    // The fallback *is* the frame's content, so replacing it is what makes the
    // placeholder's promise real. For `append`/`prepend` that replacement is the
    // insert itself: the frame is empty once the fallback is gone.
    if (merge === "append" || merge === "prepend") {
      return (
        <turbo-stream action="update" target={id}>
          <template>{children}</template>
        </turbo-stream>
      );
    }
    // `before`/`after` insert outside the frame, so they empty it first, then
    // place the content around what is left.
    return (
      <>
        <turbo-stream action="update" target={id}>
          <template />
        </turbo-stream>
        <turbo-stream action={ACTION[merge]} target={id}>
          <template>{children}</template>
        </turbo-stream>
      </>
    );
  },

  Frame: ({ id, children }) => <turbo-frame id={id}>{children}</turbo-frame>,
});
