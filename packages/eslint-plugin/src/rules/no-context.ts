import { ESLintUtils } from "@typescript-eslint/utils";

export const noContext = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow React Context usage.",
    },

    schema: [],
    messages: {
      noContext:
        "React Context is not compatible with @vincle/core. Use props or a Registry.",
    },
  },
  defaultOptions: [],
  create(context) {
    const contextIdentifiers = new Set<string>();

    const isCreateContext = (callee: any) =>
      (callee.type === "Identifier" && callee.name === "createContext") ||
      (callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "createContext");

    return {
      CallExpression(node) {
        if (isCreateContext(node.callee)) {
          context.report({
            node,
            messageId: "noContext",
          });
        }
      },
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === "CallExpression" &&
          isCreateContext(node.init.callee) &&
          node.id.type === "Identifier"
        ) {
          contextIdentifiers.add(node.id.name);
        }
      },
      JSXMemberExpression(node) {
        if (
          node.property.type === "JSXIdentifier" &&
          node.property.name === "Provider" &&
          node.object.type === "JSXIdentifier" &&
          contextIdentifiers.has(node.object.name)
        ) {
          context.report({
            node,
            messageId: "noContext",
          });
        }
      },
    };
  },
});
