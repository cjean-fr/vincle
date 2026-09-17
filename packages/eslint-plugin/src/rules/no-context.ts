import type { RuleModule } from "../types.js";

export const noContext: RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow React Context usage while allowing Vincle Providers." },
    schema: [],
    messages: {
      noContext:
        "React Context is not compatible with @vincle/core. Import createContext from @vincle/core.",
    },
  },
  defaultOptions: [],
  create(context) {
    const contextIdentifiers = new Set<string>();
    const reactFactories = new Set<string>();
    const reactNamespaces = new Set<string>();
    const isReactFactory = (callee: any): boolean =>
      (callee?.type === "Identifier" && reactFactories.has(callee.name)) ||
      (callee?.type === "MemberExpression" &&
        callee.object?.type === "Identifier" &&
        reactNamespaces.has(callee.object.name) &&
        callee.property?.type === "Identifier" &&
        callee.property.name === "createContext");

    return {
      ImportDeclaration(node: any) {
        if (node.source?.value !== "react") return;
        for (const specifier of node.specifiers ?? []) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported?.name === "createContext"
          ) {
            reactFactories.add(specifier.local.name);
          } else if (
            specifier.type === "ImportDefaultSpecifier" ||
            specifier.type === "ImportNamespaceSpecifier"
          ) {
            reactNamespaces.add(specifier.local.name);
          }
        }
      },
      CallExpression(node: any) {
        if (isReactFactory(node.callee)) {
          context.report({ node, messageId: "noContext" });
        }
      },
      VariableDeclarator(node: any) {
        if (
          node.init?.type === "CallExpression" &&
          isReactFactory(node.init.callee) &&
          node.id?.type === "Identifier"
        ) {
          contextIdentifiers.add(node.id.name);
        }
      },
      JSXMemberExpression(node: any) {
        if (
          node.property?.type === "JSXIdentifier" &&
          node.property.name === "Provider" &&
          node.object?.type === "JSXIdentifier" &&
          contextIdentifiers.has(node.object.name)
        ) {
          context.report({ node, messageId: "noContext" });
        }
      },
    };
  },
};
