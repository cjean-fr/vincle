# Precompiler architecture

The transform parses JSX, emits runtime templates and applies source edits with
sourcemaps. The public API stays in `src/index.ts`.

- `src/emit.ts`: JSX traversal, eligibility and HTML emission.
- `src/runtime-helpers.ts`: normalization of the target runtime's serializers.
- `src/template-builder.ts`: tagged-template construction.
- `src/runtime-import.ts`: helper import injection through the same source editor.
- `src/types.ts`: shared transform state and public types.

Vincle mode uses the runtime's serializers; compatibility mode preserves the
reference transform's output. Local invariants are documented beside the code
that enforces them. Transform tests live in `src/index.test.ts`; Core's
`tests/precompile-equivalence.test.ts` checks equivalence with dynamic rendering.
