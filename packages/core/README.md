# @vincle/core

VNode-based JSX-to-HTML renderer. Zero dependencies, ~3 KB gzip.

Builds a **VNode tree** then walks it to produce HTML — enables deferred
rendering, streaming (via `@vincle/flow`), and tree inspection.

## Status

`1.0.0-beta.1` — private, not published.

## API

| Export               | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `renderToString`     | Render JSX tree to HTML string (async, native)     |
| `renderToChunks`     | Render to string chunks (streaming-friendly)       |
| `jsx` / `jsxs`       | JSX runtime (auto-wired via tsconfig)              |
| `Fragment`           | `<>…</>` support                                  |
| `raw`                | Mark trusted HTML (no escaping)                    |
| `context` / `withScope` / `setContext` / `useContext` / `snapshot` | Per-request scoped context |
| `RawString`          | Branded type for pre-escaped HTML                  |

### Types

`VNode`, `RawString` (type), `Component<P>`, `CSSProperties`,
`Awaitable`, `Renderable`, `HTMLAttributes`, `SVGAttributes`, `JSX` namespace.

### Subpath exports

| Subpath                    | Module                           |
| -------------------------- | -------------------------------- |
| `.`                        | `index.ts` — full public API     |
| `./jsx-runtime`            | `src/jsx-runtime.ts`             |
| `./jsx-dev-runtime`        | `src/jsx-dev-runtime.ts`         |
| `./jsx-precompile-runtime` | `src/jsx-precompile-runtime.ts`  |
| `./html`                   | Low-level HTML primitives        |

## Error model

- **No ErrorBoundary** — removed. Errors throw / reject bare.
- **Top-level** — wrap `renderToString` in try/catch for global fallback.
- **Per-fragment** — `@vincle/flow` provides `onError` for streaming recovery.

## Test

```sh
bun test
```
