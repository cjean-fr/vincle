# Documentation preview

```sh
bun run --cwd apps/docs generate
bun run --cwd apps/docs preview
```

Highlight.js colors code at build time, so the initial HTML
already contains the token colors. No highlighting engine or language grammar
is downloaded by the browser. Plaintext and unsupported languages stay plain.
Titles, copy buttons and code tabs are retained. Light and dark colors use CSS,
so a theme change does not tokenize the code again.

The synthetic benchmark defaults to 10,000 pages, 100 paragraphs and 3 TSX code
blocks per page. It measures the SSG and exports, excluding Vite and fixture
creation. It does not measure browser download, tokenization or final DOM size.

```sh
bun run --cwd apps/docs bench:memory
BENCH_CODE_BLOCKS=0 bun run --cwd apps/docs bench:memory
```

Articles use `PageHandler` from `@vincle/ssg`: `load(source)` returns metadata and
`render(context)` emits outputs. The `@vincle/ssg/mdx` handler keeps Sätteri compilation
lazy until publication and emits HTML and source Markdown together.
`src/lib/mdx.ts` supplies only the documentation transforms and heading data. JSX uses the
SSG's built-in handler. Handler configuration uses SSG's native extension map;
Markdown pages receive prose styling unless their metadata opts out.

A page can add `keywords` to its frontmatter or `meta` (a list, or a comma-separated
string) for search terms its text does not contain. They go into the search index,
where a keyword match ranks above a passing mention in the text, and they are
rendered as `<meta name="keywords">` (comma-separated) when the page has any.

SSG detects `src/_client/main.ts` and `main.css`, enables the installed Tailwind
plugin, and shares its Vite module graph with the pages. No `vite.config` is
needed. The shared `renderPage` lifecycle installs the documentation shell
and transforms materialized HTML for the table of contents and heading anchors.
Each build/refresh closes its module runner, so changed imports reload.

## Structure

- `src/pages/`: routes and MDX content.
- `src/components/`: shared layout, documentation UI, SEO and Icon rendering.
- `src/lib/`: configuration, content pipeline, search integration and shared services.
- `src/_client/`: browser entry point, scripts and styles.
- `src/icons/`: official local Tabler SVGs; `src/lib/icons.ts` provides typed names and runtime validation.
- `tests/`: all tests, checked by TypeScript separately from source.

`src/lib/seo.ts` centralizes `getHeaders(page)` and `getStructuredData(page)`.
`SEOHeader` renders metadata in the head; `SEOFooter` renders typed JSON-LD near
the end of the body. The layout retains the per-document CSP collection for
scripts. MDX compilation, search and sitemap continue through the native SSG
integration.

The root `src/_layout.tsx` is selected by SSG. Documentation discovery supplies
navigation context lazily; SSG handles layouts, rendering and HTML transforms
once. The docs-specific transform adds headings and the table of contents.
Main styles use a separate CSS entry and a blocking link in the head in dev,
so navigation does not wait for JavaScript to inject them.
