import { useDocs } from "../context.js";
import { CodeBlock } from "./CodeBlock.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type VNode } from "@vincle/core";

export interface CodeExampleProps {
  src: string;
  language?: string;
  meta?: string;
}

export function CodeExample({ src, language, meta }: CodeExampleProps): VNode {
  return (
    readFile(
      path.resolve(useDocs().config.examples, src),
      "utf-8",
    ).then((code) => (
      <CodeBlock
        code={code}
        language={language ?? path.extname(src).slice(1)}
        meta={meta}
      />
    )) as unknown as VNode
  );
}
