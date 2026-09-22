# AGENTS: vincle

## Concision

- Keep reasoning concise: direct, structured, no rambling, no restating what is already known.
- When delegating to a subagent, explicitly ask it to be concise in its output.
- If the task genuinely requires depth (full research, detailed report, exhaustive list), you may ask the subagent for verbose output instead: say so explicitly in the task prompt.

## Commands & pipeline (root)

| Command          | What it does                                                                           |
| ---------------- | -------------------------------------------------------------------------------------- |
| `bun install`    | Install all workspace deps (respects `bun.lock`)                                       |
| `bun run build`  | Build all packages (`turbo build`, tsdown)                                             |
| `bun run check`  | Type-check every package (`tsc --noEmit`)                                              |
| `bun run test`   | Run all unit + differential fuzz tests                                                 |
| `bun run format` | Format check with `oxfmt --check .`                                                    |
| `bun run lint`   | `turbo build --filter=@vincle/eslint-plugin && oxlint .` (build first, so rules exist) |

**Order matters**: lint → format → check → test. The CI pipeline enforces this sequence.

## Layout & toolchain

- `packages/`: 6: `core`, `flow`, `vite-plugin`, `precompile`, `eslint-plugin`, `typescript-config`
- `@vincle/core`'s intrinsic element table is generated: **never hand-edit the `@generated` regions of `src/jsx-namespace.ts`**. After touching `@types/react` or `csstype` (catalog) or `scripts/codegen.ts`, run `bun run codegen` in `packages/core`; `codegen:check` (part of `check`) fails CI if the committed file is stale
- `apps/`: internal: `docs`, `bench` · `dist/`: built output (consumed by conformance tests)
- `turbo.json`: single source of task deps/caching; `build` depends on `^build`
- Node >=22 for all CI/conformance; Bun 1.4.2 pinned (`packageManager`) is the dev runtime; benchmarks run with `bun --conditions=dist`
- `tsdown` builds each package to `dist/`: **never hand-edit `dist/`**, regenerate with `bun run build`
- `bunfig.toml`: `jsx = "react-jsx"`, `jsxImportSource = "@vincle/core"`: never change without checking all packages that reference it
- Workspace deps: `@vincle/flow` → `core`; `@vincle/precompile` → `core`, `magic-string`, `oxc-parser`, `entities`

## Testing

- Each package: `bun test` (all `.test.ts`/`.test.tsx` in `src/`) + scripts `build`, `check`, `format`, `mutation`
- Fuzz tests use fixed seed windows: `VINCLE_FUZZ_SEEDS=100000 bun test src/path-equivalence.test.ts`; widen/shift with `VINCLE_FUZZ_OFFSET`
- Conformance (`@vincle/core`): `conformance:bun|node|deno|workerd`: runs the **built `dist`** (not source) against each engine
- Mutation testing (stryker) is opt-in: slow, `workflow_dispatch` only, not every PR

## Format & lint

- Format: `oxfmt --check .` is canonical; config in `.oxfmtrc.json` (import sort groups, Tailwind CSS path). Lefthook pre-commit runs format; `--no-verify` skips it in CI
- Key rules: `no-react-imports` (error) · `no-react-hooks` (error) · `no-unsafe-event-handlers` (warn) · `no-javascript-urls` (error) · `no-context` (error) · `no-refs` (error) · `no-global-jsx-namespace` (error)
- Overrides: `apps/bench/` allows React imports (benchmarks need them); `packages/core/type-contract.tsx` relaxes 2 rules for type-test purposes
- CI (`.github/workflows/ci.yml`): **cold-tree** = test w/o prebuilt artifacts then lint · **conformance** = build dist then run on 4 engines · **pipeline** (main) = lint → format → check → test → coverage

## Gotchas

- Conformance tests `dist`, not source: source-only changes can hide regressions
- `sequenceFrom` drives async rendering: never `Promise.all` for component execution order
- `raw()` is the only trusted-HTML escape hatch; default escaping is always on
- URL scheme filter blocks `javascript:`, `vbscript:`, non-image `data:`
- `type: "module"` + granular `exports`: consume via `"import"`/`"bun"` entries, not `"default"`, unless you know why

## When in doubt

`package.json` scripts = source of truth · conformance tests in `packages/core/conformance/` · `turbo.json` = task graph.

## Benchmarks (apps/bench)

- Compares `@vincle/core` vs `@kitajs/html`, React, Preact, hono/jsx on `text`/`stack`/`realworld`
- **Never quote a single run** (noise 2–6%); a delta under 3σ = noise, not a finding
- `bun run bench`: quick glance, not quotable as a delta
- Baseline: `bun run bench:stats -- --runs 8 --save results/baseline.json` → change → `bun run build --filter=@vincle/core` → `bun run bench:stats -- --runs 8 --against results/baseline.json`
- `bun run compare [a] [b]`: A/B between revisions via hermetic mini-CI builds; verdict = 95% CI on median paired ratios; `--calibrate` (default 3 A/A pairs) sets noise floor σ_pair
- `--control all` (default) measures competitors → realworld noise ~3% → ~1.3%; `--engines both` = Bun + Node (an effect on both is structural)
- `src/profile.js`: 600-iteration tight loop, one impl/case; `--cpu-prof`/`--trace-deopt` (Node), `BUN_JSC_*` (Bun)
- Measures **dist** (`"dist"` export condition; `bench:stats` depends on `^build`); absolute baselines are not versioned: record your own locally

```bash
bun run bench                                              # quick glance
bun run bench:stats -- --runs 8 --save results/baseline.json      # baseline
bun run bench:stats -- --runs 8 --against results/baseline.json   # after change
bun run compare main HEAD                                  # A/B revisions
bun run compare --control kitajs main HEAD                 # A/B, one competitor
```
