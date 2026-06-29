import { ESLintUtils } from "@typescript-eslint/utils";

export const noJavascriptUrls = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow javascript: URLs in href attributes.",
    },

    schema: [],
    messages: {
      noJavascriptUrl: "javascript: URLs are not allowed for security reasons.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (
          node.name.type === "JSXIdentifier" &&
          node.name.name === "href" &&
          node.value?.type === "Literal" &&
          typeof node.value.value === "string" &&
          node.value.value.toLowerCase().startsWith("javascript:")
        ) {
          context.report({
            node,
            messageId: "noJavascriptUrl",
          });
        }
      },
    };
  },
});
