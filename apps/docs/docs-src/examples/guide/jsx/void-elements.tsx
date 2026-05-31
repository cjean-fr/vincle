import { renderToString } from "@vincle/core";

const html = await renderToString(
  <>
    <input type="text" />
    <br />
  </>,
);

export const output = html;
