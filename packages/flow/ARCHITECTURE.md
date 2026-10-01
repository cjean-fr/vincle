# @vincle/flow architecture

Flow extends Core with deferred fragments. Core renders JSX, Flow schedules work
and emits semantic events, and adapters translate those events into client markup.
Streaming and static generation share the fragment drain.

- `src/components/` and `src/context.ts`: Slot/Defer registration and render state.
- `src/fragment-store.ts`, `src/fragment-runner.ts`, `src/flushFragments.ts` and
  `src/timeout.ts`: registration, execution, scheduling and cancellation.
- `src/render.ts` and `src/create-stream.ts`: shell delivery, event encoding and
  stream lifecycle.
- `src/static.ts`, `src/fragment.tsx` and `src/http.ts`: static, standalone fragment
  and HTTP entry points.
- `src/assets.ts`: render-local asset emission and deduplication.
- `src/adapters/`: protocol-specific placeholders, patches, frames and browser code.
- `src/types.ts`, `src/config.ts` and `src/jsx-augment.ts`: contracts, validation and
  Flow-owned JSX extensions, reachable from published entry points.

One-shot fragments run in generations; live streams run alongside them. Emission
is serialized, and adapters own framing rather than scheduling. Flow depends on
Core; Core must remain independent of Flow and its integration-specific types.

Local invariants are documented beside the implementation. Tests beside modules
and adapters cover scheduling, context, failures and delivery. Use `bun test` and
`bun run check` in this package for behavioral and type checks.
