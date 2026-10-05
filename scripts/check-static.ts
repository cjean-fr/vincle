import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const ROOT = resolve(import.meta.dir, "..");
const CORE = join(ROOT, "packages/core");

/** Repository conventions belong here, outside Stryker's instrumented suites. */
export function inspectSource(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const errors: string[] = [];
  const inCore = file.startsWith(`${CORE}${sep}`);
  function report(node: ts.Node, message: string) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    errors.push(`${relative(ROOT, file)}:${line + 1}: ${message}`);
  }
  function checkImport(node: ts.Node, specifier: string) {
    const target = resolve(dirname(file), specifier);
    const foreignPackage =
      specifier.startsWith("@vincle/") &&
      specifier !== "@vincle/core" &&
      !specifier.startsWith("@vincle/core/");
    const foreignPath =
      specifier.startsWith(".") &&
      target.startsWith(`${join(ROOT, "packages")}${sep}`) &&
      target !== CORE &&
      !target.startsWith(`${CORE}${sep}`);
    if (inCore && (foreignPackage || foreignPath)) {
      report(node, `Core must not import integration ${specifier}`);
    }
  }
  function visit(node: ts.Node) {
    if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
      const callee = node.expression.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : "";
      if (name.endsWith("Error"))
        report(node, "Use a coded Vincle error instead of throwing a new Error");
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      checkImport(node, node.moduleSpecifier.text);
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      checkImport(node, node.argument.literal.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) checkImport(node, argument.text);
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      checkImport(node, node.moduleReference.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return errors;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [file] : [];
  });
}

if (import.meta.main) {
  const errors: string[] = [];
  for (const entry of readdirSync(join(ROOT, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(ROOT, "packages", entry.name);
    const manifestFile = Bun.file(join(dir, "package.json"));
    if (!(await manifestFile.exists())) continue;
    const manifest = await manifestFile.json();
    if (entry.name === "core") {
      for (const section of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        for (const name of Object.keys(manifest[section] ?? {})) {
          if (name.startsWith("@vincle/") && name !== "@vincle/core") {
            errors.push(`packages/core/package.json: Core must not depend on ${name}`);
          }
        }
      }
    }
    const src = join(dir, "src");
    if (!readdirSync(dir).includes("src")) continue;
    const files = sourceFiles(src);
    if (entry.name === "core") files.push(join(CORE, "index.ts"));
    for (const file of files) errors.push(...inspectSource(file, readFileSync(file, "utf8")));
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Static checks passed (coded errors and Core package boundary).");
}
