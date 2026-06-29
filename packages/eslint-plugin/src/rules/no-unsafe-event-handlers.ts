import { ESLintUtils } from "@typescript-eslint/utils";

export const noUnsafeEventHandlers = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn about event handlers which might be unsafely handled.",
    },

    schema: [],
    messages: {
      unsafeHandler:
        "Event handler attribute detected. @vincle/core will escape it to ensure HTML validity, but be cautious about the injected JS code.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (
          node.name.type === "JSXIdentifier" &&
          /^on[A-Za-z]/.test(node.name.name)
        ) {
          context.report({
            node,
            messageId: "unsafeHandler",
          });
        }
      },
    };
  },
});
