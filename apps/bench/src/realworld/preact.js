import { render as preactRender } from "preact-render-to-string";
import { jsx } from "preact/jsx-runtime";

import { createRealWorldPage } from "./shared.js";

const build = createRealWorldPage(jsx);

export const render = (name, purchases) => preactRender(build(name, purchases));
