/** @jsxImportSource ./src */
import { jscDescribe } from "bun:jsc";
import { renderToString } from "./src/create-element.js";

const tree = (
  <div class="layout">
    <header>Header</header>
    <h1 class="title">Hello World</h1>
    <footer>© 2026</footer>
  </div>
);

const html = renderToString(tree);
console.log(tree);
console.log("\nRendered HTML:\n");
console.log(html);
console.log(jscDescribe(html));
