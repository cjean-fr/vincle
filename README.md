# Vincle

Monorepo of high-performance, type-safe tools built around JSX-to-HTML rendering. **HTML first, JavaScript only where you opt into it.**

## Packages

### Core

| Package                                         | Description                                                                                                       |
| :---------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| [`@vincle/core`](./packages/core)               | JSX-to-HTML string renderer. Zero dependencies.                                                                   |
| [`@vincle/flow`](./packages/flow)               | Deferred fragments, streaming, and DOM patching — `<Slot>`, `<Template>`, `<Include>` + Turbo / HTMX / Native / ESI adapters. |
| [`@vincle/vite-plugin`](./packages/vite-plugin) | Vite asset integration — `<Asset>`, `assetUrl`, manifest resolution.                                              |

### Tooling

| Package                                                               | Description                                          |
| :-------------------------------------------------------------------- | :--------------------------------------------------- |
| [`@vincle/eslint-plugin`](./packages/eslint-plugin)                   | ESLint rules for safe @vincle/core usage.            |
| [`@vincle/precompile-core`](./packages/precompile-core)               | AST helpers for JSX precompile transforms.           |
| [`@vincle/vite-plugin-precompile`](./packages/vite-plugin-precompile) | Vite plugin for Deno-style JSX precompile transform. |

### Apps (internal)

| App                   | Description                            |
| :-------------------- | :------------------------------------- |
| [`docs`](./apps/docs) | Documentation site for `@vincle/core`. |

## Development

Managed with **Bun workspaces** and **Turbo**.

```bash
bun install
bun run build    # Build all packages
bun run test     # Run all tests (unit + fuzz/property-based)
bun run check    # Type-check everything
```

## License

MIT © Christophe Jean
