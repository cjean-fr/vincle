# Vincle

Write views in JSX. Ship HTML. Send zero JavaScript by default.

Vincle is a set of server-side rendering tools that let you write typed
components in JSX and get plain HTML back — no React runtime, no hydration,
no client framework. The server sends a complete HTML page. If you need
interactive bits, you wire in HTMX, Turbo, or your own script. Nothing
hidden.

**Short version:** you keep your server, your routing, your database.
You replace the React/Next.js component → HTML pipeline with one that
doesn't ship a 150 KB runtime to the browser.

## Getting started

Start with `@vincle/core` to render JSX to HTML. Add `@vincle/flow` when
you want the page to load before all its data is ready — the shell renders
immediately, fragments stream in and patch the DOM via HTMX, Turbo, or
vanilla browser APIs.

Core is SSR. Flow is progressive enhancement on top of it. They work
together, but core is a complete product on its own.

## Packages

### Core

| Package                                         | Description                                                                                                                |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| [`@vincle/core`](./packages/core)               | JSX-to-HTML string renderer. Zero dependencies. **Start here.**                                                            |
| [`@vincle/flow`](./packages/flow)               | Deferred fragments, streaming, and DOM patching: `<Slot>`, `<Defer>` + Turbo / HTMX / Native / WebPlatform / ESI adapters. |
| [`@vincle/vite-plugin`](./packages/vite-plugin) | Vite asset integration: `<Asset>`, `assetUrl`, manifest resolution.                                                        |

### Tooling

| Package                                             | Description                                                                         |
| :-------------------------------------------------- | :---------------------------------------------------------------------------------- |
| [`@vincle/eslint-plugin`](./packages/eslint-plugin) | ESLint rules for safe @vincle/core usage.                                           |
| [`@vincle/precompile`](./packages/precompile)       | Deno-style JSX precompile transform, with Vite and Bun adapters.                    |
| [`@vincle/site`](./packages/site)                   | Static site output generation: text, binary files, resources and rebuild lifecycle. |

### Apps (internal)

| App                     | Description                                                                             |
| :---------------------- | :-------------------------------------------------------------------------------------- |
| [`docs`](./apps/docs)   | Documentation site for `@vincle/core`.                                                  |
| [`bench`](./apps/bench) | Benchmarks vs @kitajs/html, React, Preact, hono/jsx + A/B revision comparison protocol. |

## Development

Managed with **Bun workspaces** and **Turbo**.

```bash
bun install
bun run build    # Build all packages
bun run test     # Run all tests (unit + differential fuzzers)
bun run check    # Type-check everything
```

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
