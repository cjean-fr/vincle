import { createAdapter } from "./shared.js";

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
    <turbo-stream action={merge} target={id}>
      <template>{children}</template>
    </turbo-stream>
  ),

  Frame: ({ id, children }) => <turbo-frame id={id}>{children}</turbo-frame>,
});
