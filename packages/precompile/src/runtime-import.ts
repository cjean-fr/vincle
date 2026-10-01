import type MagicString from "magic-string";
import type { Program, ImportDeclaration } from "oxc-parser";

/**
 * Make sure the helpers used by the rewritten code are imported from
 * `rtSource`, editing through the MagicString so the sourcemap stays aligned.
 *
 * - Existing named (value) import from `rtSource`: missing helpers are merged
 *   into its braces, original specifier texts (aliases included) preserved.
 * - Otherwise a new import line is inserted before the first statement,
 *   after any leading comments, so pragma comments stay on top.
 */
export function injectRuntimeImport(
  s: MagicString,
  program: Program,
  source: string,
  rtSource: string,
  helpers: string[],
): void {
  if (helpers.length === 0) return;

  for (const stmt of program.body) {
    if (stmt.type !== "ImportDeclaration") continue;
    const decl = stmt as ImportDeclaration;
    if (decl.source.value !== rtSource) continue;
    if (decl.importKind === "type") continue;
    const named = (decl.specifiers ?? []).filter((sp) => sp.type === "ImportSpecifier");
    // Default-only / namespace / side-effect import: no braces to merge into.
    if (named.length === 0) continue;

    // Only an un-aliased specifier satisfies a helper: the generated code
    // references the canonical name, so `jsxTemplate as tpl` does not count.
    const existing = new Set(
      named
        .filter((sp) => sp.imported.type === "Identifier" && sp.local.name === sp.imported.name)
        .map((sp) => (sp.imported as { name: string }).name),
    );
    const missing = helpers.filter((h) => !existing.has(h));
    if (missing.length === 0) return;

    // The specifier list, not the braces. Scanning the declaration text for `}`
    // finds the first one in *source order*, which is not the closing brace when
    // a specifier is a string (`import { "a}b" as x }`) or a comment inside the
    // block carries one, and the import is then spliced into the middle of a
    // literal. The specifier ranges name what is being extended, so nothing has
    // to be located.
    const first = named[0]!;
    const last = named[named.length - 1]!;
    const specifierTexts = named.map((sp) => source.slice(sp.start, sp.end));
    s.overwrite(first.start, last.end, [...specifierTexts, ...missing].join(", "));
    return;
  }

  const importLine = `import { ${helpers.join(", ")} } from "${rtSource}";\n`;
  const firstStmt = program.body[0];
  if (firstStmt) {
    s.appendLeft(firstStmt.start, importLine);
  } else {
    s.prepend(importLine);
  }
}
