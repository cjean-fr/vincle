import type MagicString from "magic-string";
import type { Program, ImportDeclaration, ImportSpecifier } from "oxc-parser";

/** The local name of an un-aliased canonical import, the only kind a helper can reuse. */
function canonicalName(specifier: ImportSpecifier): string | undefined {
  return specifier.imported.type === "Identifier" &&
    specifier.local.name === specifier.imported.name
    ? specifier.imported.name
    : undefined;
}

function namedSpecifiers(decl: ImportDeclaration): ImportSpecifier[] {
  return (decl.specifiers ?? []).filter(
    (specifier): specifier is ImportSpecifier => specifier.type === "ImportSpecifier",
  );
}

/**
 * Make sure the helpers used by the rewritten code are imported from
 * `rtSource`, editing through the MagicString so the sourcemap stays aligned.
 *
 * - Existing named (value) import from `rtSource`: missing helpers are merged
 *   into its braces, original specifier texts (aliases included) preserved.
 * - A canonical helper imported only as a type is promoted to a value binding,
 *   in place when it is inline (`{ type jsxAttr }`) and by a separate import
 *   when the declaration is `import type { … }`; the type-only aliases around it
 *   stay untouched. Two local bindings with the same name are a TS2300.
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

  const imports = program.body.filter(
    (stmt): stmt is ImportDeclaration =>
      stmt.type === "ImportDeclaration" && stmt.source.value === rtSource,
  );

  // Promote required inline type bindings in every declaration, not only
  // the first import chosen for appending missing helpers.
  const promotedInline = new Set<string>();
  for (const decl of imports) {
    if (decl.importKind === "type") continue;
    for (const specifier of namedSpecifiers(decl)) {
      const name = canonicalName(specifier);
      if (specifier.importKind === "type" && name !== undefined && helpers.includes(name)) {
        s.overwrite(specifier.start, specifier.end, name);
        promotedInline.add(name);
      }
    }
  }
  // A helper imported as a value anywhere is already bound.
  const existing = new Set<string>(promotedInline);
  for (const decl of imports) {
    if (decl.importKind === "type") continue;
    for (const specifier of namedSpecifiers(decl)) {
      if (specifier.importKind === "type") continue;
      const name = canonicalName(specifier);
      if (name !== undefined) existing.add(name);
    }
  }

  const missing = helpers.filter((helper) => !existing.has(helper));
  if (missing.length === 0) return;

  // Declaration-level `import type { jsxAttr }` binds the same local name a
  // value import would. Keep every other specifier, including aliases and a
  // default or namespace binding, and drop only the canonical helper now
  // provided as a value.
  const touched = new Set<number>();
  for (const decl of imports) {
    if (decl.importKind !== "type") continue;
    const all = decl.specifiers ?? [];
    const kept = all.filter((specifier) => {
      if (specifier.type !== "ImportSpecifier") return true;
      const name = canonicalName(specifier);
      return name === undefined || !missing.includes(name);
    });
    if (kept.length === all.length) continue;

    touched.add(decl.start);
    if (kept.length === 0) {
      s.remove(decl.start, decl.end);
    } else {
      s.overwrite(
        all[0]!.start,
        all[all.length - 1]!.end,
        kept.map((specifier) => source.slice(specifier.start, specifier.end)).join(", "),
      );
    }
  }

  const target = imports.find(
    (decl) => decl.importKind !== "type" && namedSpecifiers(decl).length > 0,
  );
  if (target !== undefined) {
    const named = namedSpecifiers(target);
    const specifierTexts = named.map((specifier) => {
      const name = canonicalName(specifier);
      return name !== undefined && promotedInline.has(name)
        ? name
        : source.slice(specifier.start, specifier.end);
    });
    s.overwrite(
      named[0]!.start,
      named[named.length - 1]!.end,
      [...specifierTexts, ...missing].join(", "),
    );
    return;
  }

  const importLine = `import { ${missing.join(", ")} } from "${rtSource}";\n`;
  const anchor = program.body.find((stmt) => !touched.has(stmt.start));
  if (anchor !== undefined) {
    s.appendLeft(anchor.start, importLine);
  } else {
    s.prepend(importLine);
  }
}
