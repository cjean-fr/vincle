import { raw, type JSX } from "@vincle/core";
import { escapeContent } from "@vincle/core/html";
import { toHtml } from "hast-util-to-html";
import { ExpressiveCodeBlock } from "satteri-expressive-code";

import { getRenderer } from "../lib/expressive-code.js";

export interface CodeBlockProps {
  code: string;
  language?: string;
  meta?: string;
}

function renderPlain(code: string): string {
  return `<pre class="overflow-x-auto rounded-lg bg-gray-950 dark:bg-gray-900 border border-gray-800 p-4 text-sm font-mono leading-relaxed text-gray-100"><code>${escapeContent(code)}</code></pre>`;
}

function makeCodeBlock(body: string): JSX.Element {
  return (
    <div class="docs-code-block group relative" translate="no">
      {raw(body)}
    </div>
  );
}

/**
 * One code block, markup only. Its stylesheet and JS ship in the client bundle,
 * once for the whole site — see `lib/expressive-code.ts`.
 */
export function CodeBlock({ code, language = "text", meta }: CodeBlockProps): JSX.Element {
  const cleaned = code.trim();
  if (language === "text") return makeCodeBlock(renderPlain(cleaned));

  return getRenderer()
    .then(({ ec }) => ec.render(new ExpressiveCodeBlock({ code: cleaned, language, meta })))
    .then(({ renderedGroupAst }) => makeCodeBlock(toHtml(renderedGroupAst as any)))
    .catch(() => makeCodeBlock(renderPlain(cleaned)));
}
