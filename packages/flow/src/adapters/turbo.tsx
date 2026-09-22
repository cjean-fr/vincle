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

  Patch: ({ id, children, merge }) => (
    <turbo-stream
      action={ACTION[merge]}
      method={merge === "morph" ? "morph" : undefined}
      target={id}
    >
      <template>{children}</template>
    </turbo-stream>
  ),

  Frame: ({ id, children }) => <turbo-frame id={id}>{children}</turbo-frame>,
});
