# Documentation preview

```sh
bun run --cwd apps/docs build
bun run --cwd apps/docs preview
```

Highlight.js is the default and colors code at build time, so the initial HTML
already contains the token colors. No highlighting engine or language grammar
is downloaded by the browser. Plaintext and unsupported languages stay plain.
Titles, copy buttons and code tabs are retained. Light and dark colors use CSS,
so a theme change does not tokenize the code again.

To compare with server-side Expressive Code, build both assets and pages in the
same mode:

```sh
DOCS_HIGHLIGHTER=expressive-code bun run --cwd apps/docs build
```

Rebuild without that variable to return to Highlight.js. Expressive Code's line
markers and other advanced annotations are specific to that mode.

The synthetic benchmark defaults to 10,000 pages, 100 paragraphs and 3 TSX code
blocks per page. It measures the SSG and exports, excluding Vite and fixture
creation. It does not measure browser download, tokenization or final DOM size.

```sh
bun run --cwd apps/docs bench:memory
DOCS_HIGHLIGHTER=expressive-code bun run --cwd apps/docs bench:memory
BENCH_CODE_BLOCKS=0 bun run --cwd apps/docs bench:memory
```

Articles use `PageHandler` from `@vincle/ssg`: `load(source)` returns metadata and
`render(context)` emits outputs. The docs MDX handler keeps Sätteri compilation
lazy until publication and emits HTML and source Markdown together. JSX uses the
SSG's built-in handler.

Page imports use the same Vite configuration as the client assets, through
`viteModules`. The shared `renderPage` lifecycle installs the documentation shell
and transforms materialized HTML for the table of contents and heading anchors.
Each build/refresh closes its module runner, so changed imports reload.
