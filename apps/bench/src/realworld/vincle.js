import { jsx } from "@vincle/core";
import { renderToString } from "@vincle/core";
import { createRealWorldPage } from "./shared.js";

const build = createRealWorldPage(jsx);

export const render = (name, purchases) =>
  renderToString(build(name, purchases));
