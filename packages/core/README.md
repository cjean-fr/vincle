# core-next

Future `@vincle/core` — VNode-based JSX-to-HTML renderer.

## Why core-next?

Current `@vincle/core` renders JSX → string eagerly (concatenation). core-next
builds a **VNode tree** first, then renders it. This enables:

- **Deferred rendering** — render parts of the tree on demand
- **Streaming** — push HTML as it becomes available
- **Inspection/transformation** — plugins can walk the VNode tree before render

## Status

Private, in development. Not published.

## Exports

| Subpath                    | Module                          |
| -------------------------- | ------------------------------- |
| `.`                        | `index.ts` — full public API    |
| `./jsx-runtime`            | `src/jsx-runtime.ts`            |
| `./jsx-dev-runtime`        | `src/jsx-dev-runtime.ts`        |
| `./jsx-precompile-runtime` | `src/jsx-precompile-runtime.ts` |

## Test

```sh
bun test
```
