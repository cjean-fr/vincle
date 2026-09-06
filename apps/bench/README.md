# @vincle/bench

Compares `@vincle/core` with `@kitajs/html`, React, Preact and `hono/jsx` on
three page shapes: `text`, `stack`, `realworld`.

A fourth case, `precompile`, has no competitor — nobody else has that path. Its
second term is **our other path**: the same document rendered by the tree walk,
then by what the transform emits. A case with no second term has no ratio, so
nothing divides the machine out, so no delta under 10% means anything there —
which is what took async rendering out of the bench: half of what it measured
was the engine's promise machinery, not our code. Its correctness is held by the
tests, not by a measurement.

## The rule

**One run is not a measurement.** The noise between two runs of the same binary
on the same code is 2 to 6% depending on the case — the order of magnitude of
most optimisations considered here. A delta read off one run, or even three,
does not tell a code change apart from the machine's mood.

The procedure below is what makes that binding — a baseline BEFORE the change,
`--against` after, and a delta under 3σ is a verdict. Read it before quoting a
number.

## Commands

```bash
# a glance — cannot be quoted as a delta
bun run bench
```

```bash
# a real measurement: record a baseline BEFORE touching the code
bun run bench:stats -- --runs 8 --save results/baseline.json
```

```bash
# … change the code, rebuild, then compare
bun run bench:stats -- --runs 8 --against results/baseline.json
```

Options: `--runs <n>` (default 8, minimum 2), `--save <file>`,
`--against <file>`, `--engines bun|node|both` (default `bun`).

A delta under **3σ** is reported as `noise — not a finding`. That is a verdict:
either raise `--runs` until it settles, or accept that the change is not
measurable and decide on other grounds.

**Absolute** baselines are not versioned — they belong to one machine at one
moment. Record your own locally, right before changing the code.

## What a measurement costs

`--runs 8` takes about 42 s, so 5 s per run. Two settings, both measured before
being kept:

- `bench.js` calls mitata's `measure()`, not its `run()`. The four empty
  calibrations `run()` performs cost 3.5 s per process and feed only its own
  display, of which `--json` keeps nothing.
- each case is warmed by 16 unmeasured calls, then sampled over 250 ms of
  cumulative time, against 642 ms and a single warm-up call by default.

Over 8 runs this setting gives a median inter-run cv of 2.0%, where mitata's
defaults give 3.1% in 134 s: sensitivity is not what was traded for the time.

What does change is the scale. Measured on the same `dist`, **absolute** values
drop by 3 to 14% — competitors included, whose code did not move: `run()`'s empty
calibrations were warming the process before the first case. And the **ratios**
are not spared either: they shift by −5.5% to +7.0%, because that warm-up was
not worth the same to every implementation. A ratio divides out the machine, not
a change of harness. Any baseline recorded before this change compares two
harnesses rather than two revisions of the code; re-record it.

## Why there is no gate

Three shapes were tried and measured, and none holds at this scale (3 to 12%
spread) on this workload:

| shape                                          | what it did                                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ratios against React, Preact, Hono, Kita       | confounded with the engine and the machine: the `stack` ratio against React went from 3.25 to 2.42 without a line changing. Three weeks of `REGRESSION`, none of them real. |
| A/B against a frozen build, one process a side | unbiased (means within ±2% of 1.00) but σ ≈ 3% per pair, so ~9% sensitivity at 8 pairs. The known regression, 3% in that context, passed underneath.                        |
| the same A/B in the full context               | 10% order bias: the first warms the JIT and leaves its GC to the second. The **slow** build measured 13% faster.                                                            |

Two things learned along the way, and still true:

- **A cost depends on the process context.** The same change was worth 3% in a
  process rendering only vincle, and 11% in one that also rendered the four
  competitors. Polluted inline caches are what an application looks like.
- **What actually found the regression** was a hand-run A/B: the `dist` from
  before and the one from after, on the same machine, in the same session, once
  a line is already suspected. Reproducible — commit or stash first, the second
  checkout discards whatever is uncommitted under `packages/core/src`:

```bash
git checkout <before> -- packages/core/src
bun run build --filter=@vincle/core && bun run bench:stats -- --runs 8
git checkout HEAD -- packages/core/src   # then rebuild
```

CI measures and archives. It does not decide.

## Locating a cost

`bench:stats` says _whether_ something changed, not _where_ the time goes. For
that, a profile — attribution there is reliable, because it is internal to one
process.

`src/profile.js` renders **one** implementation on **one** case, in a tight
loop: a profile of `bench.js` is a profile of mitata, not of the renderer.

```bash
NODE_ENV=production node --conditions=dist --cpu-prof src/profile.js vincle realworld 600
```

```bash
NODE_ENV=production bun --conditions=dist --cpu-prof src/profile.js kitajs realworld 600
```

Profile the **reference too**, on the same tree. "Where vincle spends its time"
reads poorly on its own; "what vincle does that kitajs does not" reads straight
away — and part of the gap turned out to be work kitajs does not do at all (URL
scheme filtering, React→HTML attribute name resolution).

A profile does not say what is **removable**: the time of unavoidable work is
still attributed where it happens. To put a number on a potential gain, ablate
the code and measure the ceiling before writing the fix.

## Both engines

The bench runs under Bun (JSC) and under Node (V8) unmodified. An effect present
on both is structural; an effect on one is an engine deoptimisation, and calls
for an entirely different fix.

```bash
# both series, ratios kept separate per engine
bun run bench:stats -- --runs 8 --engines both
```

Not the default: the daily question is "did I break something", and paying for it
twice doubles the wait. Both engines are for when you are about to write that an
effect is structural.

For a glance under V8:

```bash
NODE_ENV=production node --conditions=dist src/bench.js
```

## `dist` is what is measured

The `dist` export condition resolves `@vincle/core` to the built artefact, and
the turbo task `bench:stats` depends on `^build`. What is measured is what is
published, not the sources.
