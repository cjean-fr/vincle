# Precompiler architecture

The transform parses JSX, emits runtime templates and applies source edits with
sourcemaps. Public entry points are `src/index.ts` (transform), `src/vite.ts`
(Vite plugin) and `src/bun.ts` (Bun plugin).

- `src/config.ts`: shared runtime-source validation for all entry points.
- `src/core/index.ts`: JSX text, whitespace, attribute and animation utilities.
- `src/errors.ts`: stable error codes and error construction.
- `src/emit.ts`: JSX traversal, eligibility and HTML emission.
- `src/runtime-helpers.ts`: normalization of the target runtime's serializers.
- `src/template-builder.ts`: tagged-template construction.
- `src/runtime-import.ts`: helper import injection through the same source editor.
- `src/types.ts`: shared transform state and public types.

Vincle mode uses the runtime's serializers; compatibility mode preserves the
reference transform's output. Local invariants are documented beside the code
that enforces them. Transform and import-injection tests live in
`src/index.test.ts`, Vite runtime-detection and lifecycle tests in
`src/vite.test.ts`, and Bun adapter tests in `src/bun.test.ts`; Core's
`tests/precompile-equivalence.test.ts` checks equivalence with dynamic rendering.

Non-template elements are lowered by `transformCall` to the Deno precompile
`jsx(tag, props, key)` contract, including child grouping. Vincle's host prop
names stay authored so its runtime retains URL, rawtext and innerHTML policy;
compatibility mode uses Deno's host-name normalization. Golden fixtures in
`src/fixtures/deno-2.9.8` were executed with Deno 2.9.8 / deno_ast 0.53.3.
`src/deno-call-parity.test.ts` runs the transformed output against an independent
spy with no `createElement` export. The fixtures are behavioral call oracles,
not a claim of complete Deno compiler or generated-source equivalence.
