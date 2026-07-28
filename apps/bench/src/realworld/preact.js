import { jsx } from "preact/jsx-runtime";
import { render as preactRender } from "preact-render-to-string";
import { createRealWorldPage } from "./shared.js";

const build = createRealWorldPage(jsx);

export const render = (name, purchases) =>
  preactRender(build(name, purchases));
