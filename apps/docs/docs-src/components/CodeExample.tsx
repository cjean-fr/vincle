import { type JSX } from "@vincle/core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { useDocs } from "../context.js";
import { CodeBlock } from "./CodeBlock.js";

export interface CodeExampleProps {
  src: string;
  language?: string;
  meta?: string;
  /** Print the example's `output` export under the source, in a second block. */
  output?: boolean;
}

/**
 * What an example exports when it wants its result shown: the rendered HTML,
 * or one entry per case, in source order.
 */
type ExampleOutput = string | readonly string[];

// The export exists for the build, not for the reader.
const RE_OUTPUT_EXPORT = /\n*^export const output = [\s\S]*?;\s*$/m;

const withoutOutputExport = (source: string): string =>
  source.replace(RE_OUTPUT_EXPORT, "").trimEnd();

async function readOutput(file: string): Promise<string> {
  const module: { output?: ExampleOutput } = await import(pathToFileURL(file).href);
  const { output } = module;
  if (output === undefined) {
    throw new Error(
      `[docs] ${path.basename(file)} is rendered with \`output\` but exports none — ` +
        "add `export const output = …` (a string, or one entry per case).",
    );
  }
  return (typeof output === "string" ? [output] : output).join("\n");
}

/**
 * Resolve `src` to an example file, confined to `examplesDir`.
 *
 * `src` comes from MDX frontmatter — data, not code — and with `output` the
 * resolved file is `import()`ed: an uncontained `../../…` (or an absolute path)
 * would read files outside the examples directory and, worse, execute them at
 * build time.
 */
export function resolveExampleSrc(examplesDir: string, src: string): string {
  const resolved = path.resolve(examplesDir, src);
  if (!resolved.startsWith(path.resolve(examplesDir) + path.sep)) {
    throw new Error(
      `[docs] CodeExample src "${src}" resolves outside the examples directory — ` +
        "only relative paths inside it are allowed.",
    );
  }
  return resolved;
}

export function CodeExample({ src, language, meta, output }: CodeExampleProps): JSX.Element {
  const file = resolveExampleSrc(useDocs().config.examples, src);
  const code = readFile(file, "utf-8");

  if (!output) {
    return code.then((source) => (
      <CodeBlock code={source} language={language ?? path.extname(src).slice(1)} meta={meta} />
    ));
  }

  return Promise.all([code, readOutput(file)]).then(([source, rendered]) => (
    <>
      <CodeBlock
        code={withoutOutputExport(source)}
        language={language ?? path.extname(src).slice(1)}
        meta={meta}
      />
      <CodeBlock code={rendered} language="html" meta='title="Output"' />
    </>
  ));
}
