import type { RuleModule, RuleFixer, RuleFix } from "../types.js";

const VINCLE_CORE = "@vincle/core";

function isImported(sourceCode: any, name: string): boolean {
  for (const stmt of sourceCode.ast.body) {
    if (stmt.type !== "ImportDeclaration") continue;
    if (stmt.source?.value !== VINCLE_CORE) continue;
    for (const spec of stmt.specifiers ?? []) {
      if (spec.type === "ImportSpecifier" && spec.local?.name === name) {
        return true;
      }
    }
  }
  return false;
}

function importFix(fixer: RuleFixer, sourceCode: any, name: string): RuleFix | null {
  if (isImported(sourceCode, name)) return null;
  return fixer.insertTextBeforeRange([0, 0], `import type { ${name} } from "${VINCLE_CORE}";\n`);
}

export const noGlobalJsxNamespace: RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    hasSuggestions: true,
    schema: [],
    messages: {
      preferImportedJsx:
        'The global `JSX` namespace comes from React, not @vincle/core — a bare `JSX.{{member}}` is typed wrong for Vincle. Import `JSX` from "@vincle/core".',
      useVNode: "Replace `JSX.Element` with the public `VNode` type.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    let hasLocalJsx = false;
    const offenders: any[] = [];

    const noteLocal = (name: string | undefined) => {
      if (name === "JSX") hasLocalJsx = true;
    };

    return {
      ImportDeclaration(node: any) {
        for (const spec of node.specifiers ?? []) noteLocal(spec.local?.name);
      },
      TSModuleDeclaration(node: any) {
        if (node.id?.type === "Identifier") noteLocal(node.id.name);
      },
      TSTypeAliasDeclaration(node: any) {
        noteLocal(node.id?.name);
      },
      VariableDeclarator(node: any) {
        if (node.id?.type === "Identifier") noteLocal(node.id.name);
      },
      "TSTypeReference > TSQualifiedName"(node: any) {
        if (node.left?.type === "Identifier" && node.left.name === "JSX") {
          offenders.push(node);
        }
      },
      "Program:exit"() {
        if (hasLocalJsx || offenders.length === 0) return;

        offenders.sort((a: any, b: any) => (a.range?.[0] ?? 0) - (b.range?.[0] ?? 0));

        offenders.forEach((node: any, index: number) => {
          const member = node.right?.type === "Identifier" ? node.right.name : "Element";

          const suggest: any[] =
            member === "Element"
              ? [
                  {
                    messageId: "useVNode",
                    fix: (fixer: RuleFixer) =>
                      [
                        importFix(fixer, sourceCode, "VNode"),
                        fixer.replaceText(node, "VNode"),
                      ].filter((f) => f !== null),
                  },
                ]
              : [];

          context.report({
            node,
            messageId: "preferImportedJsx",
            data: { member },
            fix:
              index === 0 ? (fixer: RuleFixer) => importFix(fixer, sourceCode, "JSX") : undefined,
            suggest,
          });
        });
      },
    };
  },
};
