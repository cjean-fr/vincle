# Vincle

Write views in JSX. Ship HTML. Send zero JavaScript by default.

Vincle is a set of server-side rendering tools that let you write typed
components in JSX and get plain HTML back — no React runtime, no hydration,
no client framework. The server sends a complete HTML page. If you need
interactive bits, you wire in HTMX, Turbo, or your own script. Nothing
hidden.

**Short version:** you keep your server, your routing, your database.
You replace the React/Next.js component → HTML pipeline with one that
doesn't ship a 150 KB runtime to the browser. And when the whole site can be
files, `@vincle/ssg` renders it at build time.

**Documentation:** [vincle.cjean.fr](https://vincle.cjean.fr)

## Getting started

Start with `@vincle/core` to render JSX to HTML. Building a site, a blog or
a docs page set? Go straight to `@vincle/ssg` (beta): a directory of pages
and Markdown becomes static HTML at build time — layouts, assets, RSS and
sitemap included. This documentation site is built with it.

## Experimental: Flow

`@vincle/flow` explores deferred fragments and streaming on top of core: the
page shell renders immediately, fragments arrive later and patch the DOM via
a small native polyfill, HTMX, Turbo, or ESI.

Its future is tied to the
[declarative partial updates](https://github.com/WICG/declarative-partial-updates)
specification: as the proposal moves, Flow's API and wire format will move
with it, with breaking changes between releases. Try it, give feedback, but
don't build anything you can't refactor on it.

## Packages

### Core

| Package                                         | Description                                                                                |
| :---------------------------------------------- | :----------------------------------------------------------------------------------------- |
| [`@vincle/core`](./packages/core)               | JSX-to-HTML string renderer. Zero dependencies. **Start here.**                            |
| [`@vincle/ssg`](./packages/ssg)                 | Static site generator (beta): layouts, JSX/MDX, multiple outputs, plugins and Vite assets. |
| [`@vincle/vite-plugin`](./packages/vite-plugin) | Vite asset integration: `<Asset>`, `assetUrl`, manifest resolution.                        |

### Tooling

| Package                                             | Description                                                      |
| :-------------------------------------------------- | :--------------------------------------------------------------- |
| [`@vincle/eslint-plugin`](./packages/eslint-plugin) | ESLint rules for safe @vincle/core usage.                        |
| [`@vincle/precompile`](./packages/precompile)       | Deno-style JSX precompile transform, with Vite and Bun adapters. |

### Experimental

| Package                           | Description                                                                                                                                                             |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@vincle/flow`](./packages/flow) | Deferred fragments, streaming, and DOM patching: `<Slot>`, `<Defer>` + Turbo / HTMX / Native / WebPlatform / ESI adapters. Tracks the declarative partial updates spec. |

### Apps (internal)

| App                     | Description                                                                             |
| :---------------------- | :-------------------------------------------------------------------------------------- |
| [`docs`](./apps/docs)   | Documentation site, built with `@vincle/ssg`.                                           |
| [`bench`](./apps/bench) | Benchmarks vs @kitajs/html, React, Preact, hono/jsx + A/B revision comparison protocol. |

## Development

Managed with **Bun workspaces** and **Turbo**.

```bash
bun install
bun run build    # Build all packages
bun run test     # Run all tests (unit + differential fuzzers)
bun run check    # Type-check everything
bun run lint     # Build the lint plugin and lint with Bun canary
```

Lint uses `bun x bun@canary` because the built-in linter is not available in
Bun 1.4.5 stable. It reads `.oxlintrc.json`, including the custom plugin, and
fails on warnings. Build and test commands keep using the stable runtime.

The differential fuzzers in `@vincle/core` run a fixed seed window, so a CI
divergence replays from the failure message alone. `VINCLE_FUZZ_SEEDS` and
`VINCLE_FUZZ_OFFSET` widen or shift it:

```bash
cd packages/core
VINCLE_FUZZ_SEEDS=100000 bun test tests/path-equivalence.test.ts
```

## License

MIT © Christophe Jean

## Publishing

See [RELEASING.md](./RELEASING.md) for the first-publication setup and release order.
