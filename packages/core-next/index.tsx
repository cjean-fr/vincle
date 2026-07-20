/** @jsxImportSource ./src */
import { renderToString } from "./src/create-element.js";

const tree = (
  <div class="layout">
    <header>Header</header>
    <h1 class="title">Hello World</h1>
    <footer>© 2026</footer>
  </div>
);

console.log("VNode tree:\n");
console.log("  tag:", tree.tag);
console.log("  children[0] tag:", tree.children?.[0]?.tag);

const html = renderToString(tree);
console.log("\nRendered HTML:\n");
console.log(html);
