export const include = (
  <template src="/fragment" buffer sanitize="unsafe" crossorigin="anonymous" />
);
export const frame = (
  <turbo-frame id="main" src="/fragment" target="other">
    Content
  </turbo-frame>
);
export const stream = (
  <turbo-stream action="append" method="morph" target="main">
    Content
  </turbo-stream>
);

// @ts-expect-error Flow's template attributes retain their value types.
export const badBuffer = <template buffer="yes" />;
// @ts-expect-error Flow's custom elements retain their value types.
export const badFrame = <turbo-frame src={123} />;
