import { renderToString } from "@vincle/core";

const html = await renderToString(<h1>Hello, world!</h1>);
console.log(html); // "<h1>Hello, world!</h1>"
