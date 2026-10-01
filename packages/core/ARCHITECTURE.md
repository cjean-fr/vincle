# @vincle/core architecture

Core renders JSX to HTML through a hybrid representation: static elements become
trusted serialized HTML, while components and dynamic values remain deferred
until the tree walk. Static, dynamic and precompiled paths share serialization
policy and must produce equivalent output.

- `src/jsx-runtime.ts` and `src/types.ts`: construction and node representations.
- `src/render.ts`: component evaluation and ordered asynchronous rendering.
- `src/serialize.ts`, `src/attrs.ts`, `src/template-attrs.ts`, `src/escape.ts`
  and `src/tag.ts`: HTML serialization, escaping and validation.
- `src/jsx-precompile-runtime.ts`: compiled-template rendering.
- `src/provider.ts`, `src/scope.ts` and `src/als.ts`: tree context and execution state.
- `src/jsx-namespace.ts` and `scripts/codegen.ts`: JSX types and generated tables.

Core is independent of Flow. Integration-specific JSX types belong to the
integration package, using neutral Core interfaces as augmentation points.
Public entry points are defined in `index.ts` and the package subpath exports.

Local invariants are documented beside their implementation. Module tests cover
behavior; `tests/precompile-equivalence.test.ts` checks rendering equivalence,
`conformance/` checks runtimes, and `bun run check` checks types and generated files.
