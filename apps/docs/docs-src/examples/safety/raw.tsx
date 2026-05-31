import { renderToString, raw } from "@vincle/core";

// Raw strings pass through verbatim — no escaping applied
const html = await renderToString(<div>{raw("<strong>Bold</strong>")}</div>);

export const output = html;
