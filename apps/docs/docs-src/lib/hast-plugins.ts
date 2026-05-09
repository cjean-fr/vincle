import { defineHastPlugin } from "satteri";

export const wrapTables = defineHastPlugin({
  name: "wrap-tables",
  element: {
    filter: ["table"],
    visit(node) {
      return {
        type: "element",
        tagName: "div",
        properties: { className: ["docs-table-wrapper"] },
        children: [node],
      };
    },
  },
});
