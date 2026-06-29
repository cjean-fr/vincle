import { ESLintUtils } from "@typescript-eslint/utils";

export const noReactImports = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow React and React-DOM imports.",
    },

    schema: [],
    messages: {
      noReactImport: "React imports are not compatible with @vincle/core.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (source === "react" || source === "react-dom") {
          context.report({
            node,
            messageId: "noReactImport",
          });
        }
      },
    };
  },
});
