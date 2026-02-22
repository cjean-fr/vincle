import type { RuleModule } from "../types.js";

export const noReactImports: RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow React and React-DOM imports." },
    schema: [],
    messages: {
      noReactImport: "React imports are not compatible with @vincle/core.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ImportDeclaration(node: any) {
        const source = node.source?.value;
        if (source !== "react" && source !== "react-dom") return;
        // Allow type-only imports — needed for JSX type augmentation.
        if (node.importKind === "type") return;
        if (node.specifiers?.every?.((s: any) => s.importKind === "type")) return;
        context.report({ node, messageId: "noReactImport" });
      },
    };
  },
};
