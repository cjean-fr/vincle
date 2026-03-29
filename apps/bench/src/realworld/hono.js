import { jsx as honoJsx } from "hono/jsx";

import { createRealWorldPage } from "./shared.js";

function jsx(tag, props) {
  const { children, ...rest } = props ?? {};
  if (children === undefined) return honoJsx(tag, rest);
  if (Array.isArray(children)) return honoJsx(tag, rest, ...children);
  return honoJsx(tag, rest, children);
}

const build = createRealWorldPage(jsx);

export const render = (name, purchases) => String(build(name, purchases));
