# @vincle/core

The JSX → HTML engine. No runtime dependencies, ~10 KB gzip for the whole entry
point (`dist/index.mjs` plus its shared chunk).

Two renderers over one tree walk: `renderToString` for a document,
`renderToChunks` for a stream. Static subtrees are folded to final HTML at
`jsx()` time; anything dynamic stays a `VNode` for the walk.

## Status

`1.0.0-beta.1` — private, not published.

## API

| Export                                                             | Purpose                                        |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| `renderToString`                                                   | Render a JSX tree to an HTML string            |
| `renderToChunks`                                                   | Render to string chunks, flushed as they exist |
| `jsx` / `jsxs`                                                     | JSX runtime (auto-wired via tsconfig)          |
| `Fragment`                                                         | `<>…</>` support                               |
| `raw`                                                              | Mark trusted HTML — no escaping                |
| `context` / `withScope` / `setContext` / `useContext` / `snapshot` | Per-request scoped context                     |

### Types

`VNode` (type only), `RawString`, `Awaitable`, `Renderable`, `CSSProperties`,
`ClassValue`, `FromReact`, and the `JSX` namespace.

`VNode` is exported as a type and not as a value: it is the engine's internal
representation, and `jsx()` is the only way to make one.

### Subpath exports

| Subpath                    | Module                                          |
| -------------------------- | ----------------------------------------------- |
| `.`                        | `index.ts` — the public API                     |
| `./jsx-runtime`            | `src/jsx-runtime.ts`                            |
| `./jsx-dev-runtime`        | `src/jsx-dev-runtime.ts`                        |
| `./jsx-precompile-runtime` | `src/jsx-precompile-runtime.ts`                 |
| `./html`                   | Low-level HTML primitives, for build-time tools |

Each JSX runtime re-exports the `JSX` namespace, because TypeScript resolves
`JSX.*` from the module named in `jsxImportSource`.

## Guarantees

These are the properties the tests exist to hold. They are worth stating because
each one was, at some point, quietly untrue.

- **Components execute in document order — in both renderers.** What renders
  before you in the markup ran before you. `renderToString` used to overlap
  sibling I/O, which made a document that read mutated context depend on how long
  each sibling took. Overlapping I/O is available where the markup shows it:
  `<Template>` / `<Slot>` in `@vincle/flow`. See `src/execution-order.test.ts`.

- **The two renderers emit the same bytes.** Joining every chunk of
  `renderToChunks` gives exactly `await renderToString(node)`. Pinned by a
  differential fuzzer over 500 generated async trees, and by construction now that
  both walks share an execution order.

- **The fold and the walk emit the same bytes.** A static subtree pre-rendered at
  `jsx()` time is byte-identical to the same subtree walked as a `VNode` — 1000
  generated trees, `src/path-equivalence.test.ts`.

- **The precompile runtime and the VNode runtime agree.** `jsxAttr` and
  `buildAttrs` are two attribute serializers over the same JSX; a case list keeps
  them honest, value kind by value kind.

- **Async is never something the developer arranges.** A promise is awaited
  wherever one can appear: a child, a component's return, an array element, an
  attribute _value_, `dangerouslySetInnerHTML.__html`, a sync or async iterable.
  Nothing serializes as `[object Promise]`.

- **Escaping and URL filtering are not optional.** Text and attributes are escaped
  by default; `<script>`/`<style>` follow rawtext rules so real JS and CSS can be
  written inline; `javascript:`, `vbscript:` and non-image `data:` URLs are
  replaced with `#blocked` in URL attributes. Scheme detection follows the WHATWG
  parser, so obfuscation with tabs or control characters does not get through — and
  a relative URL is not mistaken for a scheme.

- **Attributes are typed per element.** `JSX.IntrinsicElements` is derived from
  `@types/react`, so `<dvi clas="x">` is a compile error. Custom elements (any
  hyphenated name) stay open. Attribute names use React's camelCase spelling,
  which the engine maps to the HTML one — including the SVG presentation
  attributes (`strokeWidth` → `stroke-width`).

## `@types/react`

An **optional, type-only** peer dependency. Nothing is imported at runtime. With
it, every HTML and SVG attribute is typed per element; without it, JSX still
compiles and renders, with attributes unchecked.

## Error model

- **No ErrorBoundary.** Errors reject; there is no component-level recovery here.
- `renderToString` never throws synchronously — every failure arrives as a
  rejection, so one `try`/`catch` around the await is enough.
- A failing sibling stops the ones after it, in both renderers.
- **Per-fragment recovery** is `@vincle/flow`'s `onError`, for streaming.

## Design records

[`adr/003-rendu-et-mesure.md`](adr/003-rendu-et-mesure.md) — the rendering
decisions, and the measurement discipline any performance claim has to meet.

## Test

```sh
bun test
```

```sh
bun run check && bun run mutation
```
