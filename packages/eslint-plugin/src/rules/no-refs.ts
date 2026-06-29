import { ESLintUtils } from "@typescript-eslint/utils";

export const noRefs = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow React refs usage.",
    },

    schema: [],
    messages: {
      noRef:
        "Refs are not compatible with @vincle/core as there is no DOM access.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type === "JSXIdentifier" && node.name.name === "ref") {
          context.report({
            node,
            messageId: "noRef",
          });
        }
      },
    };
  },
});
