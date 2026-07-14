import type { RuleModule } from "../types.js";

export const noRefs: RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow React refs usage." },
    schema: [],
    messages: {
      noRef: "Refs are not compatible with @vincle/core as there is no DOM access.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node: any) {
        if (node.name?.type === "JSXIdentifier" && node.name.name === "ref") {
          context.report({ node, messageId: "noRef" });
        }
      },
    };
  },
};
