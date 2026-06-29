# Vincle

Monorepo of high-performance, type-safe tools built around JSX-to-HTML rendering. **HTML first, JavaScript only where you opt into it.**

## Packages

### `jsx-string` stack

| Package                                       | Description                                                                                                       |
| :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| [`@vincle/jsx-string`](./packages/jsx-string) | JSX-to-HTML string renderer. Zero dependencies.                                                                   |
| [`@vincle/jsx-flow`](./packages/jsx-flow)     | Deferred fragments, streaming, and DOM patching — the `<Defer>` primitive + Turbo / HTMX / Native / ESI adapters. |
| [`@vincle/jsx-vite`](./packages/jsx-vite)     | Vite asset integration — `<Asset>`, `assetUrl`, manifest resolution.                                              |

### Other tools

| Package                                                                   | Description                                                |
| :------------------------------------------------------------------------ | :--------------------------------------------------------- |
| [`@vincle/eslint-plugin-jsx-string`](./packages/eslint-plugin-jsx-string) | ESLint rules for safe jsx-string usage.                    |
| [`@vincle/jsx-precompile-core`](./packages/jsx-precompile-core)           | AST-agnostic shared helpers for JSX precompile transforms. |
| [`@vincle/vite-plugin-precompile`](./packages/vite-plugin-precompile)     | Vite plugin for Deno-style JSX precompile transform.       |

### Apps (internal)

| App                   | Description                                  |
| :-------------------- | :------------------------------------------- |
| [`docs`](./apps/docs) | Documentation site for `@vincle/jsx-string`. |

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
