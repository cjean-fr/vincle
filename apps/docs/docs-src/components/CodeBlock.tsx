import { createRenderer, ExpressiveCodeBlock } from "satteri-expressive-code";
import { toHtml } from "hast-util-to-html";
import { raw } from "@vincle/core";
import { useDocs } from "../context.js";
import { escapeHtml } from "../lib/escape.js";

export interface CodeBlockProps {
  code: string;
  language?: string;
  meta?: string;
}

let rendererPromise: ReturnType<typeof createRenderer> | null = null;

function getRenderer() {
  if (!rendererPromise) {
    rendererPromise = createRenderer({
      themes: ["github-light", "github-dark"],
    });
  }
  return rendererPromise;
}

const injectedPages = new Set<string>();

export async function CodeBlock({
  code,
  language = "text",
  meta,
}: CodeBlockProps) {
  const renderer = await getRenderer();
  const { ec, baseStyles, themeStyles, jsModules } = renderer;

  const page = useDocs();
  const pageKey = `ec:${page.currentPage}`;
  const isFirstOnPage = !injectedPages.has(pageKey);
  if (isFirstOnPage) injectedPages.add(pageKey);

  const cleaned = code.trim();

  let body: string;
  if (language === "text") {
    body = renderPlain(cleaned);
  } else {
    try {
      const codeBlock = new ExpressiveCodeBlock({
        code: cleaned,
        language,
        meta,
      });
      const { renderedGroupAst, styles } = await ec.render(codeBlock);

      const head: string[] = [];
      if (isFirstOnPage) {
        if (baseStyles) head.push(baseStyles);
        if (themeStyles) head.push(themeStyles);
      }
      if (styles.size) head.push([...styles].join(""));
      if (head.length) body = `<style>${head.join("")}</style>`;
      else body = "";

      body += toHtml(renderedGroupAst);

      if (isFirstOnPage && jsModules.length) {
        body += `<script type="module">if(!window.__ec){window.__ec=true;${jsModules.join("")}}</script>`;
      }
    } catch {
      body = renderPlain(cleaned);
    }
  }

  return (
    <div class="docs-code-block group relative my-4" translate="no">
      {raw(body)}
    </div>
  );
}

function renderPlain(code: string): string {
  return `<pre class="overflow-x-auto rounded-lg bg-gray-950 dark:bg-gray-900 border border-gray-800 p-4 text-sm font-mono leading-relaxed text-gray-100"><code>${escapeHtml(code)}</code></pre>`;
}
