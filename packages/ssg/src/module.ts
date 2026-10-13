import { build, transform, type Loader } from "esbuild";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { diagnose } from "./errors.js";

/** Compile local imports, leave installed packages external, and reload each build. */
export async function loadModule(
  file: string,
  importSource: string,
  compiled?: string,
): Promise<Record<string, unknown>> {
  return diagnose(
    () => loadModuleInternal(file, importSource, compiled),
    "Could not compile or evaluate module",
    {
      reason: "COMPILATION_FAILED",
      hint: "Check this file's syntax and imports, installed dependencies, and the selected JSX runtime. The compiler/evaluation error is preserved as cause.",
      context: { file, importSource, phase: "compile" },
    },
  );
}

async function loadModuleInternal(
  file: string,
  importSource: string,
  compiled?: string,
): Promise<Record<string, unknown>> {
  const temporary = await mkdtemp(path.join(path.dirname(file), ".vincle-ssg-"));
  // Keep import.meta.url directory-relative resources beside the original source.
  const outfile = `${temporary}.mjs`;
  const artifacts = new Set<string>([outfile]);
  const sourceDefines = (source: string) => ({
    "import.meta.url": JSON.stringify(pathToFileURL(source).href),
    "import.meta.dirname": JSON.stringify(path.dirname(source)),
    "import.meta.filename": JSON.stringify(source),
  });
  try {
    const result = await build({
      ...(compiled === undefined
        ? { entryPoints: [file] }
        : {
            stdin: {
              contents: compiled,
              sourcefile: file,
              resolveDir: path.dirname(file),
              loader: "js",
            },
          }),
      outfile,
      write: false,
      define: sourceDefines(file),
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      target: "esnext",
      jsx: "automatic",
      jsxImportSource: importSource,
      plugins: [
        {
          name: "vincle-runtime",
          setup(builder) {
            builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
              const extension = path.extname(args.path).slice(1);
              const loader: Loader = extension.endsWith("tsx")
                ? "tsx"
                : extension.endsWith("jsx")
                  ? "jsx"
                  : extension.endsWith("ts")
                    ? "ts"
                    : "js";
              const transformed = await transform(await readFile(args.path, "utf8"), {
                loader,
                sourcefile: args.path,
                target: "esnext",
                format: "esm",
                jsx: "automatic",
                jsxImportSource: importSource,
                tsconfigRaw: {
                  compilerOptions: { jsx: "react-jsx", jsxImportSource: importSource },
                },
                define: sourceDefines(args.path),
              });
              return {
                contents: transformed.code,
                loader: "js",
                resolveDir: path.dirname(args.path),
              };
            });
            builder.onResolve({ filter: /^@vincle\/core(?:\/.*)?$/ }, (args) => ({
              path: fileURLToPath(import.meta.resolve(args.path)),
              external: true,
            }));
          },
        },
      ],
      logLevel: "silent",
    });
    for (const output of result.outputFiles) artifacts.add(output.path);
    await Promise.all(result.outputFiles.map((output) => writeFile(output.path, output.contents)));
    return await import(pathToFileURL(outfile).href);
  } finally {
    await Promise.all([...artifacts].map((artifact) => rm(artifact, { force: true })));
    await rm(temporary, { recursive: true, force: true });
  }
}
