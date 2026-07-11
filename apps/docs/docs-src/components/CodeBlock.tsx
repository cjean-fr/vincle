import { createRenderer, ExpressiveCodeBlock } from "satteri-expressive-code";
import { toHtml } from "hast-util-to-html";
import { raw, type VNode } from "@vincle/core";
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

function renderPlain(code: string): string {
  return `<pre class="overflow-x-auto rounded-lg bg-gray-950 dark:bg-gray-900 border border-gray-800 p-4 text-sm font-mono leading-relaxed text-gray-100"><code>${escapeHtml(code)}</code></pre>`;
}

function makeCodeBlock(body: string): VNode {
  return (
    <div class="docs-code-block group relative my-4" translate="no">
      {raw(body)}
    </div>
  ) as VNode;
}

export function CodeBlock({
  code,
  language = "text",
  meta,
}: CodeBlockProps): VNode {
  const p = getRenderer()
    .then((renderer) => {
      const { ec, baseStyles, themeStyles, jsModules } = renderer;

      const page = useDocs();
      const pageKey = `ec:${page.currentPage}`;
      const isFirstOnPage = !injectedPages.has(pageKey);
      if (isFirstOnPage) injectedPages.add(pageKey);

      const cleaned = code.trim();

      function handleResult(body: string): VNode {
        if (isFirstOnPage && jsModules.length) {
          body += `<script type="module">if(!window.__ec){window.__ec=true;${jsModules.join("")}}</script>`;
        }
        return makeCodeBlock(body);
      }

      if (language === "text") {
        return makeCodeBlock(renderPlain(cleaned));
      }

      const head: string[] = [];
      if (isFirstOnPage) {
        if (baseStyles) head.push(baseStyles);
        if (themeStyles) head.push(themeStyles);
      }

      return ec
        .render(
          new ExpressiveCodeBlock({ code: cleaned, language, meta }),
        )
        .then(({ renderedGroupAst, styles }) => {
          if (styles.size) head.push([...styles].join(""));
          const style = head.length ? `<style>${head.join("")}</style>` : "";
          return handleResult(style + toHtml(renderedGroupAst));
        })
        .catch(() => makeCodeBlock(renderPlain(cleaned)));
    });

  return p as unknown as VNode;
}
