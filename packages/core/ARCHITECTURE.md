# @vincle/core architecture

Core renders JSX to HTML from a single neutral representation: every element is a
VNode until the render walk, which carries the parser context (HTML / SVG / MathML
namespace, rawtext) down to the escaping layer. Escaping therefore follows the
namespace the content stands in, and the tree can render to a second vocabulary
(`@vincle/core/xml`) without being rebuilt. Dynamic and precompiled paths share
serialization policy and must produce equivalent output.

- `src/jsx-runtime.ts` and `src/types.ts`: construction and node representations,
  including the precompile helpers (`jsxTemplate`, `jsxAttr`, `jsxEscape`).
- `src/parse-context.ts`: the parser context the walk threads — namespace
  transitions and the markup-text scan of trusted (`raw()`, template) bytes.
- `src/render.ts`: component evaluation and ordered asynchronous rendering.
- `src/xml.ts`: `renderToXml`, the XML rendering of the same neutral tree.
- `src/serialize.ts`, `src/attrs.ts`, `src/template-attrs.ts`, `src/escape.ts`,
  `src/tag.ts` and `src/props.ts`: HTML serialization, escaping and validation.
- `src/jsx-precompile-runtime.ts`: the entry point the precompile transform
  imports; it re-exports the helpers from `jsx-runtime.ts`.
- `src/html.ts`: the `./html` subpath, primitives shared with build-time tooling.
- `src/errors.ts`: the stable `code` on every error the package throws.
- `src/provider.ts`, `src/scope.ts` and `src/als.ts`: tree context and execution state.
- `src/jsx-namespace.ts` and `scripts/codegen.ts`: JSX types and generated tables.

Core is independent of Flow. Integration-specific JSX types belong to the
integration package, using neutral Core interfaces as augmentation points.
Public entry points are defined in `index.ts` and the package subpath exports.

Local invariants are documented beside their implementation. Module tests cover
behavior; `tests/precompile-equivalence.test.ts` checks rendering equivalence,
`conformance/` checks runtimes, and `bun run check` checks types and generated files.
