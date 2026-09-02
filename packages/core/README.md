# @vincle/core

The JSX → HTML engine. No runtime dependencies, under 10 KB gzip for the whole
package — every entry point and shared chunk in `dist`, held there by
`size-budget.test.ts`.

One renderer, one tree walk: `renderToString` for a document. Static subtrees
are folded to final HTML at `jsx()` time; anything dynamic stays a `VNode` for
the walk.

## Status

`0.9.0` — private, not published.

## API

| Export                                                             | Purpose                               |
| ------------------------------------------------------------------ | ------------------------------------- |
| `renderToString`                                                   | Render a JSX tree to an HTML string   |
| `jsx` / `jsxs`                                                     | JSX runtime (auto-wired via tsconfig) |
| `Fragment`                                                         | `<>…</>` support                      |
| `raw`                                                              | Mark trusted HTML — no escaping       |
| `context` / `withScope` / `setContext` / `useContext` / `snapshot` | Per-request scoped context            |

### Types

`VNode`, `RawString`, `Awaitable`, `Renderable`, `CSSProperties`, `ClassValue`,
`FromReact`, and the `JSX` namespace.

`VNode` is a concrete class — one element (tag, attrs, children) — exported as
a **value**, not just a type: the precompile contract (Deno/Preact) requires
the runtime to test for it with `instanceof`. `jsx()` is how you should make
one; building one by hand is supported rather than merely possible — the
constructor validates the tag name, because the tree walk does not re-check it.
`Renderable` is the separate, broader type: everything a component may return (a
`VNode`, a string, a promise, an iterable of any of those, …).

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

- **Components execute in document order.** What renders before you in the
  markup ran before you, so a document that reads mutated context does not depend
  on how long each sibling took. Overlapping I/O is available where the markup
  shows it: `<Template>` / `<Slot>` in `@vincle/flow`. See
  `src/execution-order.test.ts`.

- **The fold and the walk emit the same bytes.** A static subtree pre-rendered at
  `jsx()` time is byte-identical to the same subtree walked as a `VNode` — 1000
  generated trees, `src/path-equivalence.test.ts`.

- **The precompile runtime and the VNode runtime agree.** `jsxEscape` /
  `jsxTemplate` are a third traversal of the same value taxonomy — 1000 generated
  values, `src/precompile-equivalence.test.ts`. `jsxAttr` and `buildAttrs` remain
  two attribute serializers pinned by a residual equivalence in `attrs.test.ts`.
  The precompile surface is exactly `jsxTemplate` / `jsxAttr` / `jsxEscape` — the
  contract Deno defined and Preact and Hono also export — so the transform in
  `@vincle/vite-plugin-precompile` emits nothing a compatible runtime lacks, and
  hands back what it cannot express with those three (a rawtext element with a
  dynamic hole, a void element carrying content).

- **Async is never something the developer arranges.** A promise is awaited
  wherever one can appear: a child, a component's return, an array element, an
  attribute _value_, `dangerouslySetInnerHTML.__html`, a sync or async iterable.
  Nothing serializes as `[object Promise]`.

- **The output is the tree, or an error.** A void element given content
  (`<img>{caption}</img>` — which type-checks, since `@types/react` allows
  children there) has no valid HTML form: a parser drops the closing tag and
  reparents the content. Both paths refuse it rather than emit it. A child that
  renders to nothing is not content, so a conditional child still renders the
  bare element.

- **Escaping and URL filtering are not optional.** Text and attributes are escaped
  by default; `<script>`/`<style>` follow rawtext rules so real JS and CSS can be
  written inline — **whatever shape the child arrives in**: a string, a promise,
  an iterable, an async iterable, or a component that returns code, so
  `<script>{await getCode()}</script>` reaches the JavaScript engine as written.
  The escape form follows the element's sub-language, so a JSON data block —
  `<script type="application/ld+json">{JSON.stringify(data)}</script>` — stays
  parseable without `raw()`. `javascript:`, `vbscript:` and non-image `data:` URLs are
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

DOM typings are currently generated from `@types/react` and adapted for
Vincle. This may be replaced by a standards-based source if a sufficiently
complete and maintainable one becomes available.

## Error model

- **No error-boundary component.** Errors reject; there is no component-level
  recovery here.
- `renderToString` never throws synchronously — every failure arrives as a
  rejection, so one `try`/`catch` around the await is enough. **One exception**,
  at the root of the tree: a static subtree is folded during `jsx()`, so what the
  fold refuses — an unserializable attribute, an invalid tag name, content in a
  void element — throws where the JSX is _written_, before `renderToString` is
  ever called. `renderToString(<div onClick={fn}>text</div>)` throws;
  `renderToString(<div onClick={fn}><Comp/></div>)` rejects. Inside a component
  the distinction disappears — `jsx()` then runs during the walk, which converts
  the throw.
- A failing sibling stops the ones after it.
- **`Error` messages are annotated with the throwing component's name**, once:
  `[Profile] not found`. Only the innermost component — an ancestor that
  re-throws the same error doesn't add itself. A thrown value that isn't an
  `Error` passes through unchanged.
- **Messages are self-contained**: `[vincle/<package>] <api>: <what>. <why>.
<how to fix it>` — the prefix is stable and greppable, and the message names
  the offending value. Config errors fail fast, at the entry point that
  receives the config, before anything renders.
- **Per-fragment recovery** is `@vincle/flow`'s `onError`, for streaming.

## Test

```sh
bun test
```

```sh
bun run check && bun run mutation
```
