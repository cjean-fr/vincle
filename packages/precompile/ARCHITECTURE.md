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
that enforces them. Transform tests live in `src/index.test.ts`; Core's
`tests/precompile-equivalence.test.ts` checks equivalence with dynamic rendering.
