import { renderToString } from "@vincle/core";

const html = await renderToString(<h1>Hello</h1>);
// → "<h1>Hello</h1>"
