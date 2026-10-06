import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

const ROOT = resolve(import.meta.dir, "..");
const dir = mkdtempSync(join(tmpdir(), "vincle-published-types-"));
const options: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: false,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  jsxImportSource: "@vincle/core",
  types: [],
};

function check(fixture: string, jsx: ts.JsxEmit, entry?: string) {
  const file = join(dir, fixture);
  const text = readFileSync(join(ROOT, "tests/published-types", fixture), "utf8");
  writeFileSync(file, (entry ? `import "${entry}";\n` : "") + text);
  const program = ts.createProgram([file], { ...options, jsx });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    console.error(`Published types: ${fixture}, ${entry ?? "Core alone"}, ${ts.JsxEmit[jsx]}`);
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => dir,
        getNewLine: () => "\n",
      }),
    );
    throw new Error("Published declaration contract failed");
  }
}

try {
  writeFileSync(join(dir, "package.json"), '{"type":"module"}');
  for (const name of ["core", "flow"]) {
    const target = join(dir, "node_modules/@vincle", name);
    mkdirSync(target, { recursive: true });
    cpSync(join(ROOT, "packages", name, "package.json"), join(target, "package.json"));
    // No sources, workspace links, tsconfig paths or ambient workspace types.
    cpSync(join(ROOT, "packages", name, "dist"), join(target, "dist"), { recursive: true });
  }
  for (const jsx of [ts.JsxEmit.ReactJSX, ts.JsxEmit.ReactJSXDev]) check("core.tsx", jsx);
  const manifest = JSON.parse(readFileSync(join(ROOT, "packages/flow/package.json"), "utf8"));
  for (const subpath of Object.keys(manifest.exports)) {
    const entry = subpath === "." ? "@vincle/flow" : `@vincle/flow${subpath.slice(1)}`;
    for (const jsx of [ts.JsxEmit.ReactJSX, ts.JsxEmit.ReactJSXDev]) check("flow.tsx", jsx, entry);
    check("explicit.ts", ts.JsxEmit.ReactJSX, entry);
  }
  console.log(
    "Published declarations passed for Core and every Flow export (production, development and explicit JSX types).",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
