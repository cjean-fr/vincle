import { jsx } from "@kitajs/html/jsx-runtime";
import { createRealWorldPage } from "./shared.js";

const build = createRealWorldPage(jsx);

export const render = (name, purchases) =>
  build(name, purchases);
