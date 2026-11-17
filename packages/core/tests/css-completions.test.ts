import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// The generated CSS unions take their open string arm as `string & {}`, not
// bare `string`: a plain `string` arm absorbs the keyword literals of the
// union and leaves editors with no completions for values like "auto". The
// reduced type is identical either way, so only the language service observes
// the difference — these completions are the user-facing contract.

const namespacePath = join(import.meta.dir, "../src/jsx-namespace.ts");
const MARK = "/*c*/";

const withMarks = `
import type { CSSProperties } from "${namespacePath.replace(/\.ts$/, "")}";
const size: CSSProperties = { backgroundSize: "${MARK}" };
const box: CSSProperties = { width: "${MARK}" };
`;

// Mark offsets against the cleaned snippet: each removal shifts the later ones.
const marks: number[] = [];
let searchFrom = 0;
for (;;) {
  const i = withMarks.indexOf(MARK, searchFrom);
  if (i === -1) break;
  marks.push(i - MARK.length * marks.length);
  searchFrom = i + MARK.length;
}
const content = withMarks.replaceAll(MARK, "");

test("generated CSS unions keep their keyword literals in editor completions", () => {
  const files = new Map<string, string>([
    ["/app.ts", content],
    [namespacePath, readFileSync(namespacePath, "utf8")],
  ]);
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => "1",
    getScriptSnapshot: (file) => {
      const text = files.get(file) ?? ts.sys.readFile(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => "/",
    getCompilationSettings: () => ({
      strict: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (file) => files.has(file) || ts.sys.fileExists(file),
    readFile: (file) => files.get(file) ?? ts.sys.readFile(file),
    readDirectory: ts.sys.readDirectory,
    directoryExists: (dir) => dir === "/" || ts.sys.directoryExists(dir),
    getDirectories: ts.sys.getDirectories,
  };
  const ls = ts.createLanguageService(host);

  const completionNames = (position: number): Set<string> =>
    new Set(
      (ls.getCompletionsAtPosition("/app.ts", position, {})?.entries ?? []).map((e) => e.name),
    );

  const size = completionNames(marks[0]!);
  expect(size.has("auto")).toBe(true);
  expect(size.has("contain")).toBe(true);
  expect(size.has("cover")).toBe(true);

  const width = completionNames(marks[1]!);
  expect(width.has("max-content")).toBe(true);
  expect(width.has("fit-content")).toBe(true);
});
