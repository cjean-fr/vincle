---
name: vincle-docs
description: Consume the Vincle documentation as an agent: page index, per-page Markdown twins, full-text search index, and the page map of the Vincle server-side JSX library.
---

# Vincle docs

Vincle renders typed JSX into HTML strings on the server. The documentation at
this site is public and fully machine-readable.

## Machine-readable content

- `/llms.txt`: index of every doc page (title + URL)
- `/llms-full.txt`: every page as plain text, in reading order
- `/search-index.json`: JSON array of `{ "url", "title", "text" }` for full-text search
- Any page URL + `.md`: the page as Markdown, with example code inlined
  (e.g. `/guide/views.md`); the home page is `/index.md`

## Page map

- `/guide/`: concepts: getting started, JSX, components, views, security
- `/integration/`: `@vincle/flow` under `/integration/flow/` (deferred fragments, streaming, static generation, adapters, HTTP serving), the precompile transform, TSRX
- `/api/`: reference: `@vincle/core` and `@vincle/flow`

## Notes

- The `.md` twins are verbatim copies of the MDX sources: `<CodeExample src>`
  tags reference example files relative to `apps/docs/src/examples/` in
  https://github.com/cjean-fr/vincle (branch `main`), and `<Tabs>` blocks carry
  each option as a `{ label, content }` entry.
- The rendered HTML of each page carries
  `<link rel="alternate" type="text/markdown" href="<page>.md">`.
- Search and agent access are welcome.
