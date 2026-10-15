# @vincle/core architecture

Core renders JSX to HTML through a hybrid representation: static elements become
trusted serialized HTML, while components and dynamic values remain deferred
until the tree walk. Static, dynamic and precompiled paths share serialization
policy and must produce equivalent output.

- `src/jsx-runtime.ts` and `src/types.ts`: construction and node representations,
  including the precompile helpers (`jsxTemplate`, `jsxAttr`, `jsxEscape`).
- `src/render.ts`: component evaluation and ordered asynchronous rendering.
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
