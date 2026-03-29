import { renderToStaticMarkup } from "react-dom/server";
import { jsx } from "react/jsx-runtime";

import { createRealWorldPage } from "./shared.js";

const build = createRealWorldPage(jsx);

export const render = (name, purchases) => renderToStaticMarkup(build(name, purchases));
