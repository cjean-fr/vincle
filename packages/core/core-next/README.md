# @vincle/core (core-next)

VNode-based JSX-to-HTML string renderer. **Zero dependencies. Secure by default. Fast.**

> This package is the next generation of `@vincle/core`: a small, well-organized
> VNode model that a synchronous renderer, an async renderer, and (in
> `@vincle/flow`) a streaming renderer all share.

## Philosophy

- **No dependencies** — nothing at runtime. `@types/react` is an *optional* peer:
  install it for precise per-element JSX types, omit it and JSX still compiles
  with a permissive fallback.
- **Secure by default** — all text and attribute values are HTML-escaped
  automatically. No `safe` attribute to remember (unlike kitajs); `raw()` is the
  explicit opt-out for trusted HTML.
  vincle does **not** rewrite URL schemes (`javascript:`, `data:`, …): escaping
  prevents attribute/tag breakout, and scheme policy is the app's job (CSP +
  sanitizing untrusted URLs). Silent scheme blocklists give a false sense of
  security (they are bypassable via embedded control characters) — we don't ship one.
- **Fast** — a hybrid model: fully-static subtrees are folded to a string once,
  at `jsx()` time; only dynamic subtrees keep a VNode for the tree walk. The
  synchronous renderer returns a plain `string` on a monomorphic hot path.
- **Small & tidy** — the smallest useful API, each file with one job.

## API

```ts
import { renderToString, renderToStringAsync, raw } from "@vincle/core";
```

- `renderToString(node): string` — synchronous. Throws (pointing you to the
  async renderer) if it meets a Promise / async component.
- `renderToStringAsync(node): string | Promise<string>` — resolves async
  components and Promise / async-iterable children.
- `raw(html): RawString` — mark trusted HTML to skip escaping.
- Context: `context`, `setContext`, `useContext`, `withScope`, `snapshot`
  (request-scoped via `AsyncLocalStorage`).

### Subpaths

- `@vincle/core/jsx-runtime`, `@vincle/core/jsx-dev-runtime` — the automatic JSX
  runtime (`jsx`, `jsxs`, `jsxDEV`, `Fragment`, `createElement`).
- `@vincle/core/jsx-precompile-runtime` — `jsxTemplate` / `jsxAttr` / `jsxEscape`
  for Deno-style `precompile` transforms; byte-identical to the runtime path.
- `@vincle/core/html` — low-level serialization primitives (`escapeHtml`,
  `escapeAttr`, `buildAttrs`, `serializeElement`, `VNode`, `RawString`, …) so
  `@vincle/flow` can build its own renderer over the same VNode tree.

## What lives elsewhere

Streaming, deferred fragments, and islands are **`@vincle/flow`**'s job — it
consumes this package's VNode tree and primitives. core stays a pure
VNode → string renderer.

## Configuration

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@vincle/core"
  }
}
```
