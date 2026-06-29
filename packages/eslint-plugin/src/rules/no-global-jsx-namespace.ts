import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

const VINCLE_CORE = "@vincle/core";

/**
 * Is `name` already imported from "@vincle/core" in this file?
 * Used so the fixers never insert a duplicate import.
 */
function isImported(
  sourceCode: Readonly<TSESLint.SourceCode>,
  name: string,
): boolean {
  for (const stmt of sourceCode.ast.body) {
    if (stmt.type !== "ImportDeclaration") continue;
    if (stmt.source.value !== VINCLE_CORE) continue;
    for (const spec of stmt.specifiers) {
      if (spec.type === "ImportSpecifier" && spec.local.name === name) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Insert `import type { <name> } from "@vincle/core";` at the top of the file,
 * or `null` if that binding is already imported. Kept as a standalone top-level
 * import (rather than merged into an existing one) so the edit is deterministic;
 * a follow-up `--fix` from `import/no-duplicates` can merge it if desired.
 */
function importFix(
  fixer: TSESLint.RuleFixer,
  sourceCode: Readonly<TSESLint.SourceCode>,
  name: string,
): TSESLint.RuleFix | null {
  if (isImported(sourceCode, name)) return null;
  return fixer.insertTextBeforeRange(
    [0, 0],
    `import type { ${name} } from "${VINCLE_CORE}";\n`,
  );
}

export const noGlobalJsxNamespace = ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: "problem",
    fixable: "code",
    hasSuggestions: true,
    schema: [],
    messages: {
      preferImportedJsx:
        'The global `JSX` namespace comes from React, not @vincle/core — a bare `JSX.{{member}}` is typed wrong for Vincle. Import `JSX` from "@vincle/core".',
      useVincleNode: "Replace `JSX.Element` with the public `VincleNode` type.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    // A local binding named `JSX` (import, namespace, type alias, or variable)
    // shadows the global, so `JSX.x` is no longer the leaked React one.
    let hasLocalJsx = false;
    const offenders: TSESTree.TSQualifiedName[] = [];

    const noteLocal = (name: string | undefined): void => {
      if (name === "JSX") hasLocalJsx = true;
    };

    return {
      ImportDeclaration(node) {
        for (const spec of node.specifiers) noteLocal(spec.local.name);
      },
      TSModuleDeclaration(node) {
        if (node.id.type === "Identifier") noteLocal(node.id.name);
      },
      TSTypeAliasDeclaration(node) {
        noteLocal(node.id.name);
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier") noteLocal(node.id.name);
      },
      // `JSX.<member>` in a type position: `JSX.Element`, `JSX.IntrinsicElements`,
      // including inside indexed access (`JSX.IntrinsicElements["div"]`).
      "TSTypeReference > TSQualifiedName"(node: TSESTree.TSQualifiedName) {
        if (node.left.type === "Identifier" && node.left.name === "JSX") {
          offenders.push(node);
        }
      },
      "Program:exit"() {
        if (hasLocalJsx || offenders.length === 0) return;

        offenders.sort((a, b) => a.range[0] - b.range[0]);

        offenders.forEach((node, index) => {
          const member =
            node.right.type === "Identifier" ? node.right.name : "Element";

          const suggest: TSESLint.ReportSuggestionArray<"useVincleNode"> =
            member === "Element"
              ? [
                  {
                    messageId: "useVincleNode",
                    fix: (fixer) =>
                      [
                        importFix(fixer, sourceCode, "VincleNode"),
                        fixer.replaceText(node, "VincleNode"),
                      ].filter((f): f is TSESLint.RuleFix => f !== null),
                  },
                ]
              : [];

          context.report({
            node,
            messageId: "preferImportedJsx",
            data: { member },
            // Attach the import auto-fix to the first offender only: a single
            // insertion per pass keeps the fix deterministic; ESLint re-lints
            // until stable, so the remaining `JSX.*` resolve on the next pass
            // (once `JSX` is imported, `hasLocalJsx` is true → no reports).
            fix:
              index === 0
                ? (fixer) => importFix(fixer, sourceCode, "JSX")
                : null,
            suggest,
          });
        });
      },
    };
  },
});
