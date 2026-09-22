# Context Provider: implementation plan

Status: **implemented and validated locally (2026-09-17)**. No release or push
has been performed. The implementation is in the working tree on top of
`48d17f4`; see the completion record below.

## Target contract

```tsx
const Locale = createContext("fr");

await renderToString(
  <Locale.Provider value="en">
    <Page />
  </Locale.Provider>,
);

function Page() {
  return <h1>{useContext(Locale)}</h1>;
}
```

- `useContext` reads the nearest Provider in the rendered JSX tree. With no
  Provider, it returns the value passed to `createContext`. Nested Providers
  override their ancestors; later siblings see the ancestor's value.
- Values stay correct across `await`, concurrent renders and deferred fragments.
  Rendering errors must unwind the Provider without leaking its value.
- A root Provider works without an outer `withScope`. Rendering a static subtree
  under it must keep the precompiled static markup path.
- The current ambient context is a separate interface for per-execution state.
  **Recommended name: `ExecutionContext`**, because the current
  `AsyncLocalStorage` scope is per async execution, not process-global. Move
  current `context` / `setContext` / `useContext` / `withScope` / `snapshot`
  behavior there. The new root `useContext` is reserved for the tree context.
- Match React/Preact/Hono Provider _semantics and common JSX shape_; this does
  not imply component or package compatibility with their runtimes.

Planned propagation: keep the tree context in its own `AsyncLocalStorage`
store, separate from `ExecutionContext`. Each Provider enters an immutable
frame `{ context, value, parent }` **while its children are rendered**.
`useContext(Context)` walks the active frame chain, then returns the declared
default if none matches. `AsyncLocalStorage.run(frame, renderChildren)` carries
the frame across `await` without mutating the parent; a sibling rendered after
a successful Provider resumes in the parent frame. On a throw or rejection,
rendering remains fail-fast, and a later independent render or error fallback
must not inherit the failed Provider's frame. No manual global stack push/pop
is needed. `ExecutionContext.set` inside a Provider must retain its existing
execution-scope semantics. Share only the runtime detection/fallback plumbing
if that simplifies the implementation, not the mutable store itself.

Before public export, settle the exact `ExecutionContext` method names.
The package is unpublished: remove the old exports directly. Do not publish an overloaded `useContext` that
silently accepts both kinds of context.

## Feasibility already checked

Our precompile transform rendered a Preact Provider and descendant reader as
`<div><b>inner</b></div>`. Preact's `jsxTemplate` keeps a template node until
render. Vincle's current `jsxTemplate` resolves a component hole immediately.
In a temporary Vincle adapter that delayed templates, a nested async case
rendered `outer → inner → nested → inner → outer`. That adapter delayed **all**
templates, so it proves feasibility but is not the production implementation.
No spike files remain in the repository.

## Design and review rules

- Challenge each implementation before integration: can its public interface or
  number of concepts be reduced? Does each module own one clear responsibility,
  and do dependencies point toward the core rendering contract? Use SOLID and
  Clean Architecture as design checks, not as a reason to add layers.
- Keep execution context, JSX Provider semantics, template representation and
  flow orchestration in their respective modules. Introduce an adapter or
  abstraction only where at least two real implementations need that seam. No
  speculative registries, factories or generic frameworks.
- Prefer the simplest correct implementation. A deliberate departure from these
  design rules is acceptable for a material performance gain, but record the
  measured A/B result, the affected case and the reason in the code review.
  A single benchmark run or a delta within the calibrated noise floor is not
  evidence for added complexity.
- Ask a review agent to challenge the design at each integration point,
  including a simpler alternative and the cost of removing any new layer.
  Address concrete findings before moving to the next stage.

## Stages

### 1. Contract and baseline

Owner: primary agent. Can start in the next session.

- Specify behavior cases for default value, nesting, siblings, asynchronous
  readers, errors, concurrent renders, precompiled descendants, and deferred
  fragments. Define two future benchmark fixtures: a root Provider with mostly
  static HTML and one with many translated values. Implement the fixtures with
  the feature in stage 4.
- Record the current `dist` performance baseline immediately before code
  changes, following `apps/bench/README.md`; keep absolute baseline files local.
- Set the performance acceptance criteria before implementing Provider: existing
  no-Provider cases must avoid a statistically significant regression; define
  what Provider overhead is acceptable for the two new fixtures so the verdict
  is not chosen after seeing the numbers.
- Replace the old public names directly; the package is unpublished and needs
  no compatibility aliases or deprecation period.

Done when the contract is written and the baseline is reproducible. This stage
does not change public exports.

### 2. Separate the ambient execution context

Owner: agent A. Files: `packages/core/src/context.ts`, `packages/core/index.ts`,
`packages/flow/src/context.ts` and related call sites/tests. Work in an isolated
branch or worktree.

- Introduce the `ExecutionContext` interface around the existing behavior.
- Migrate `@vincle/flow` and internal callers to explicit execution-context
  names. Keep existing public exports until the final cutover so each stage
  builds on its own.
- Preserve key identity, snapshots, async isolation, fallback behavior and
  current error handling. Do not change the meaning of the old store.

Done when existing execution-context tests and flow tests pass with no behavior
change. Open an integration PR and merge/rebase this stage into a dedicated
integration branch before stage 3 starts.

### 3. Preserve component laziness in precompiled templates

Owner: agent B. Files: `packages/core/src/jsx-runtime.ts`, `render.ts`,
`types.ts`, and targeted precompile tests. Branch from the integrated stage 2
state and submit a stacked integration PR; do not develop these core changes
against the older base in parallel with agent A.

- **Strict static-path rule:** a template with only provably static native DOM
  markup must compile to the same literal template and return a direct
  `RawString`; it must perform no Provider/context lookup, frame allocation or
  extra subtree walk. A DOM-only template with synchronous value holes also
  keeps the existing direct path when no value needs deferred rendering.
  Defer only templates containing a component or an async/lazy value that must
  be rendered under its eventual Provider. The compiler cannot prove that an
  arbitrary JavaScript expression is pure, so such cases must stay
  conservative. A root Provider still pays once to enter its scope; the rule
  excludes a per-template or per-static-element context tax.
- Keep literal markup as template strings inside deferred templates; do not
  reconstruct a VNode for every static element.
- Preserve document order, escaping, rawtext handling, promise/iterable behavior
  and the existing `jsxTemplate` contract for callers outside Providers.
- Add differential tests: ordinary JSX and transformed JSX must emit identical
  bytes, including nested components and async readers. Assert generated code
  and runtime behavior for static-only templates so they cannot silently start
  using the deferred path.

Done when a precompiled component is invoked at render time and static-only
templates still take the existing fast path. Escalate any significant baseline
regression before integrating this stage. Merge the stacked PR into the
integration branch and run the combined stage 2 + 3 tests before stage 4.

### 4. Implement tree Context and Provider

Owner: primary agent or agent C, **after stages 2 and 3 are integrated**.
Files: core context/renderer/JSX types and focused tests.

- Implement `createContext(defaultValue)`, `Context.Provider` and a distinct
  tree-context reader. Export it as `useContext` only at the public cutover.
- Use the separate tree-context `AsyncLocalStorage` and immutable Provider
  frames described above. Enter the frame when rendering children, never when
  constructing JSX. A root Provider establishes its own frame; `useContext`
  outside any Provider returns the default. Test that an `await` leaves the
  next sibling on its parent frame. Test that a synchronous throw or rejected
  async child does not leak its frame into a later independent render or error
  fallback; retain the renderer's fail-fast sibling behavior. None of these
  cases may change the ambient `ExecutionContext` store.
- Verify type inference for `value`, children and `useContext(Context)`.
- Check the same trees through ordinary JSX and precompile; include nested
  Providers, a component inside a precompiled native template, rawtext,
  concurrent requests, rejected async components and the synchronous fallback
  when `AsyncLocalStorage` is unavailable.

Done when the contract from stage 1 passes in both rendering modes.

### 5. Flow integration

Owner: agent D after stage 4. Files: `packages/flow` and its tests.

- Ensure `Defer`, `DeferGroup`, slots and fragment flushes capture the nearest
  Provider value at the correct point and retain it when rendered later.
- Test two concurrent streams with different Provider values, a nested
  override, and a fragment that resolves after its parent shell.
- Keep flow's internal orchestration state in `ExecutionContext`.

Done when static and streaming flow output keeps context isolation.

### 6. Public interface and technical validation gate

Owner: primary agent; an independent review agent challenges scope isolation,
precompile parity, simplicity and public compatibility.

- Expose the final `createContext`, `useContext` and `.Provider` interface.
  Move the ambient interface to `ExecutionContext` and remove the old root names.
- Review each new abstraction against the design rules above. Simplify the
  implementation where another layer does not earn its cost. Keep an exception
  only when its performance gain is statistically supported and documented.
- Run lint, format check, type checks and affected core/flow/precompile tests.
  Build `dist` before conformance and benchmarks; run core conformance on Bun,
  Node, Deno and workerd where available. Documentation examples may still use
  the old interface at this point, so the full docs checks wait for stage 7.
- Compare unchanged workloads against the recorded baseline with the repository
  A/B protocol. On Bun and Node, also measure new root-Provider fixtures:
  mostly static HTML and a translation-heavy tree. Compare each with its
  equivalent ordinary-rendering path in the same session. Report effects and
  uncertainty; a delta within the calibrated noise floor is inconclusive.
- Require no significant unaccepted regression in existing no-Provider cases.
  Keep static-only precompile direct. For Provider cases, quantify scope cost
  and verify that precompilation still retains its benefit on static-heavy
  markup. If either finding is materially negative, revise the implementation
  and repeat this gate before touching documentation or examples.

Done only when the implementation, independent design review, correctness and
performance findings are accepted. **Do not update examples or docs yet.**

### 7. Examples, documentation and final checks

Owner: documentation agent after stage 6 passes; primary agent integrates.

- Update the context guide, React migration page, comparison table, examples,
  type contracts and package README. State the difference between tree Provider
  and execution-scoped state, using only the final API.
  Do this only after the development is validated and the benchmark
  gate above has passed.
- Run the full repository CI order: lint → format check → check → test, then
  build the docs. Resolve any stale examples or claims without changing the
  approved runtime design; if runtime code must change, repeat stage 6.

Done when the interface, examples and docs agree and all checks pass. Release
is a separate decision; do not publish during this stage unless requested.

## Session and agent coordination

1. Start each session from this file and note completed stages here. Preserve
   the user's other uncommitted work; use separate worktrees for parallel agents.
2. Stages 2 and 3 are **sequential core PRs**, not parallel edits. Agent A
   finishes stage 2 and its integration PR first; agent B branches from that
   integrated state for stage 3. Review and integrate both before stage 4.
3. Documentation and example work starts only after the stage 6 technical and
   benchmark gate. Do not have two agents edit `packages/core/src/context.ts`,
   `render.ts` or `jsx-runtime.ts` simultaneously.
4. End each session with the branch/ref, changed files, passing checks,
   benchmark artifacts kept locally, unresolved decisions and the next stage.

## Completion record: 2026-09-17

- Stages 1–7 are complete in the current working tree. `createContext` /
  `useContext` provide tree values; `ExecutionContext` owns the earlier ambient
  behavior. The old root execution exports are removed; root `useContext`
  accepts only tree Contexts. The package is unpublished, so no migration or
  deprecation layer is needed.
- The independent review found nested template escaping and fallback nesting
  bugs, then requested real streaming and fallback coverage. Those findings
  were addressed and their tests pass. The new `TemplateNode` represents only
  templates that must defer a component or lazy hole. Static-only templates
  still return `RawString` directly.
- Earlier no-Provider A/B against `48d17f4`, before the final Deno compatibility
  and runtime optimizations, used eight pairs and three calibration
  pairs: `apps/bench/results/context-provider-ab-final.json`. Text, stack,
  realworld and precompiled precompile had no finding. The raw ordinary
  precompile case measured A/B ×1.007, 95% CI [1.002, 1.051]; its 0.7% median
  is below the calibrated ~1% resolvable floor and lacks competitor control,
  so that earlier measurement was inconclusive. It does not establish the
  absence of a regression in the final working tree.
- Final equivalent-source Provider fixtures, eight direct runs on Bun and four
  on Node: `apps/bench/results/context-provider-final-direct.json`. Static-heavy
  precompile rendered 3.27M vs 731k ops/s on Bun (4.48×) and 1.20M vs 435k
  on Node (2.77×). With all 100 reader components precompiled, precompile
  rendered 72.5k vs 68.8k on Bun (paired ratio 1.054 ± 0.019 at three standard
  errors) and 92.4k vs 61.2k on Node (1.510 ± 0.039). Both gains exceed the
  measured noise. The earlier Provider benchmark files used partial
  precompilation or preceded the final runtime optimization; they are
  diagnostics only. Absolute benchmark files remain local, not versioned.
- Deno's captured helper-call trace now includes Provider cases, and our
  compatibility transform matches all 28 cases exactly. Vincle's Deno helpers
  defer component and collection holes until the Provider renders. The Vincle
  dialect omits redundant `jsxEscapeDeferred` around a template child; foreign
  runtimes retain Deno's helper calls. Deno's actual TSX `precompile` transform
  also renders a Provider and mapped readers correctly against built Vincle,
  exercised by `conformance:deno`.
- `bun run lint`, `bunx oxfmt --check .`, `bun run check`, `bun run test`, and
  the docs build pass. Built-dist conformance passes 11/11 on Bun, Node, Deno
  and workerd. Workerd required network access for Wrangler.
- The earlier staged changes were committed locally as `48d17f4` before this
  implementation. The Provider implementation remains uncommitted; no push or
  publication was requested.
