/** Select the same mode for Vite and SSG: DOCS_HIGHLIGHTER=expressive-code bun run build. */
export const codeHighlighter =
  process.env["DOCS_HIGHLIGHTER"] === "expressive-code" ? "expressive-code" : "highlight.js";
