# @vincle/bench

Compares `@vincle/core` with `@kitajs/html`, React, Preact and `hono/jsx` on
three page shapes: `text`, `stack`, `realworld`.

A fourth case, `precompile`, has no competitor: nobody else has that path. Its
second term is **our other path**: the same document rendered by the tree walk,
then by what the transform emits. A case with no second term has no ratio, so
nothing divides the machine out, so no delta under 10% means anything there,
which is what took async rendering out of the bench: half of what it measured
was the engine's promise machinery, not our code. Its correctness is held by the
tests, not by a measurement.

## The rule

**One run is not a measurement.** The noise between two runs of the same binary
on the same code is 2 to 6% depending on the case: the order of magnitude of
most optimisations considered here. A delta read off one run, or even three,
does not tell a code change apart from the machine's mood.

The procedure below is what makes that binding: a baseline BEFORE the change,
`--against` after, and a delta under 3σ is a verdict. Read it before quoting a
number.

## Commands

```bash
# a glance: cannot be quoted as a delta
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
`--against <file>`, `--metric ratios|throughput` (default `ratios`),
`--engines bun|node|both` (default `bun`), and
`--ab <A> <B>` for pre-built package roots. The everyday way to ask "is this
revision faster than that one" is `bun run compare [a] [b]`: see
[A/B](#ab--is-this-build-faster-than-that-one).

A delta under **3σ** is reported as `noise, not a finding`. That is a verdict:
either raise `--runs` until it settles, or accept that the change is not
measurable and decide on other grounds.

**Absolute** baselines are not versioned. They belong to one machine at one
moment. Record your own locally, right before changing the code.

## What a measurement costs

`bench.js` uses mitata's `measure()` with its defaults: 642 ms of cumulative
sampling time per entry, plus its adaptive warm-up. It does not use `run()`'s
empty calibrations. Total duration depends on how many cases are selected and
how many implementations each has.

`VINCLE_BENCH_CASES=text,stack` selects cases without changing their sampling
settings. A change to the harness, warm-up, runtime or competitors can change
ratios even when Core stays identical. Re-record a baseline when those change.

Saved results now retain the actual child runtime version, host, competitor
versions, harness fingerprint, Core build fingerprint, repository state and raw
samples. Metadata is collected after measurement. `--against` compares ratios
by default; `--metric throughput` selects the absolute measurements. Known
incompatible environments are rejected. Old files without metadata remain
readable, but their differences cannot establish a code regression.

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
- **What actually found the regression** was comparing frozen before/after
  builds in the same session. Use `compare` below: its isolated copies preserve
  local changes and build both sides without switching this checkout.

CI does not measure. Eight processes inside one runner job share a VM for its
whole duration, so the spread they print is jitter inside that VM and not the
uncertainty of the number: over four runs the ratio against kitajs on
`realworld` moved between 0.53 and 0.64 while every run printed ±0.02, and
kitajs's own throughput moved 42%, which no commit here can cause. What decides
is the comparison above, on one machine.

## A/B: is this build faster than that one?

`bench:stats` answers "did the current code change". `compare` answers a
different question: "is build A faster than build B", and the two are not the
same measurement. The daily path records a baseline in one session and the
candidate in another, and the drift between the two sessions is part of the
noise (it has cost a verdict: five rows leaning the wrong way, the machine
having moved between the two recordings). A/B removes it: A and B are measured
interleaved in one session, in adjacent processes.

```bash
# the plain invocation: the working tree (your change) against main
bun run compare

# any two revisions: branches, tags, hashes, origin/main … ("." = working tree)
bun run compare f96edaa 3580cb7
```

Each side is built by a **mini CI**, never taken from the local dist. The build
copies the two source folders it needs, `packages/core` and
`packages/typescript-config` (which supplies the base tsconfig), _without_
`node_modules` into a throwaway workspace, then `bun install` and
`bun run build`, the way CI builds them. What is measured is what a clean
checkout of that revision would publish, whatever the local `node_modules` has
drifted into. Nothing in the workspace is touched, and the bench itself runs
each build from a throwaway sandbox where `@vincle/core` resolves to that
build and the competitors to the workspace.

`bench:stats -- --ab <A> <B>` is the same crossover with two **pre-built
package roots** (package.json + dist/) instead of revisions: for the days the
builds already exist and the git dance is not what you want.

Each pair uses two adjacent fresh processes in alternating A-then-B /
B-then-A order. The ratio of vincle to a **control** is
taken _inside each process_ (the geometric mean of the competitors;
`--control <name>` for one of them, `--control none` for none), then A is
divided by B. The machine's mood divides out inside the process; the
alternation prevents position effects, such as a warming CPU or ramping
governor, from being confounded with the build; the verdict is a bootstrap 95% CI on the
**median of the paired ratios**, which excludes 1 or it does not.

The control is what the frozen-build A/B above lacked, and it shows: on
`realworld` the per-pair noise fell from about 3% to 1.3%. Before the pairs,
`--calibrate` A/A pairs (default 3) measure that noise floor (σ_pair), and the
`resolvable` column is the smallest delta 3σ can separate at `--runs` pairs,
it falls as 1/√n, so a delta under it is either measured with more pairs or
accepted as not measurable. The `precompile` case has no competitor, so no
control: its rows are marked `(raw)` and are a glance, not a verdict.

Cost: two mini CIs (a `bun install` and a build each, about a minute the first
time, less once the bun cache is warm), then two warm-up runs plus
(calibrate + runs) × 2 processes: about three minutes at the defaults.
`--save` keeps the paired ratios, raw samples, environments, build fingerprints
and source refs (when using `compare`), so the verdict can be re-read without
re-measuring. `compare` defaults to Bun; `bench:stats --ab` also accepts
`--engines node` or `--engines both`. With both engines, `--save result` writes
`result.bun.json` and `result.node.json`, keeping their measurements separate.

What it does **not** divide out: if build B changes the engine's state, the
control, measured in the same process _after_ vincle, partly follows it,
and the verdict is pulled toward 1. Second order at the sizes measured here;
for a change that restructures the hot path, read it with that caution.

## Fixed reference for cumulative changes

`reference/core.json` pins the Core revision present before the saved 21 September
2026 benchmark. It selects `text` and `stack`, 24 alternating pairs and six A/A
calibration pairs, with Hono as the competitor control.

From this app directory:

```bash
bun run bench:reference --save results/core-reference.json
```

This reference uses `--build installed`: both isolated source copies are built
with the repository's already installed compiler and build tools. No dependency
download is needed; their actual versions are recorded. The ordinary `compare`
command keeps its mini-CI build by default (`--build mini-ci`).

Both sides use the same benchmark and competitors in this session. The reference
is rebuilt; it is a source revision, not an old timing file. Keep this reference
fixed across developments to expose cumulative movement. A small change with an
interval spanning 1 is inconclusive. If a loss is established, compare intermediate
revisions with the same protocol before profiling the affected case.

A is the fixed reference and B the current code. In this command's A/B table,
a value above 1 means the current code is slower; below 1 means it is faster.

The result preserves source refs and fingerprints; files under `results/` stay
local. An old snapshot without versions is useful context, not a causal test.

## Locating a cost

`bench:stats` says _whether_ something changed, not _where_ the time goes. For
that, a profile: attribution there is reliable, because it is internal to one
process.

`src/profile.js` renders **one** implementation on **one** case, in a tight
loop: a profile of `bench.js` is a profile of mitata, not of the renderer.

```bash
NODE_ENV=production node --conditions=dist --cpu-prof src/profile.js vincle realworld 600
```

```bash
NODE_ENV=production bun --conditions=dist --cpu-prof src/profile.js kitajs realworld 600

# the recursive workload, with the same depth and repeats as bench.js
NODE_ENV=production bun --conditions=dist --cpu-prof src/profile.js vincle stack 6000
```

Profile the **reference too**, on the same tree. "Where vincle spends its time"
reads poorly on its own; "what vincle does that kitajs does not" reads straight
away, and part of the gap turned out to be work kitajs does not do at all (URL
scheme filtering, React→HTML attribute name resolution).

A profile does not say what is **removable**: the time of unavoidable work is
still attributed where it happens. To put a number on a potential gain, ablate
the code and measure the ceiling before writing the fix.

## Reading what the engine emitted

`bench:stats` says whether something changed and a profile says where the time
goes; neither says what the JIT made of the code. When a rearrangement keeps
losing, this is what tells you whether anything is left to win.

Node exposes all of it on the stock release binary:

```bash
# the optimised machine code for one function, with the tier that produced it
node --conditions=dist --print-opt-code --print-opt-code-filter=serializeElement \
  src/profile.js vincle realworld 300
```

```bash
# why a function fell back out of optimised code: reasons in plain words
node --conditions=dist --trace-deopt src/profile.js vincle realworld 400
```

A handful of bailouts at start-up is warm-up. A reason that repeats is a
function the engine keeps giving up on, and that costs more than any delta
argued about here. Add `--no-turbo-inlining` when a function is small enough to
be inlined into its caller and so never gets a code object of its own.

Bun answers the other half. `BUN_JSC_<option>=1` passes any JSC option through,
but the disassembler is not compiled into the binary, so what it gives is the
tier ladder:

```bash
BUN_JSC_reportCompileTimes=1 bun --conditions=dist src/profile.js vincle realworld 400
```

Each line names a function and the tier it reached: LLInt → Baseline → DFG →
FTL. Anything hot that stops below FTL is worth more than a rearrangement.

Size comes out of a second option. Its disassembly is the part that is missing,
not its bookkeeping: every compiled function is announced with the address range
its code occupies, and the size is the difference:

```bash
BUN_JSC_dumpDFGDisassembly=1 bun --conditions=dist src/profile.js vincle realworld 300 2>&1 \
  | grep -A1 "JIT code for serializeStatic#"
```

```
Generated DFG JIT code for serializeStatic#…, instructions size = 411:
    Code at [0x7b57b2c9aea0, 0x7b57b2c9c5e0):   ← 6 976 bytes
```

That is the column to put next to V8's `Instructions (size = …)`, and the two do
not have to agree. Moving a check from one function to another shrank both under
V8 and grew the caller by half under JSC, because DFG inlines a callee's body
where TurboFan kept the call. A change that reads as "less code" on one engine
can be "more code" on the other.

One process per candidate when comparing two forms. Sharing a call site between
them lets the first one run monomorphic and the rest not, which is larger than
the difference being measured.

Measure in both directions before believing a delta. Record the baseline, measure
the candidate, then record a baseline _on the candidate_ and measure the original
against it. A real effect changes sign; drift does not. Five rows all leaning the
same way survived one direction and vanished in the other, on a change that
removes work: the machine had moved between the two recordings.

Two things this has already settled:

- Both engines take the whole render path to their top tier, with no repeating
  deopt. What is left per element is the work, not a missed optimisation.
- Under V8 a template literal emits a `ToString` call per substitution that `+`
  does not; under JSC the two compile the same. Writing `serializeElement`'s two
  literals as `+` measures +4% on V8 and −4% on JSC: a choice of engine, not a
  gain.

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

## Flow: fragments, latency and memory

```bash
# From the repository root: builds Core and Flow before measuring their dist.
bun x turbo run bench:flow -- --runs 8 --save /tmp/flow-before.json
# After a change, on the same machine and runtime:
bun x turbo run bench:flow -- --runs 8 --against /tmp/flow-before.json --save /tmp/flow-after.json
```

`bench:flow` exercises five workloads with the Htmx adapter: 100 and 1,000
explicit fragment targets with later Slots (marker removal), 1,500 nested
fragment generations, 2,000 small stream chunks, and a reader that waits 1 ms
between 30 chunks (backpressure). Each render creates fresh content and drains
the complete wire stream. The ASCII fixtures let the harness check wire byte
counts across runs and against the baseline; semantic equivalence belongs to
the tests, since equal lengths alone do not prove equal output.

Each scenario runs in a fresh process for each of the eight runs, with two
warm-up renders and five timed renders (`--samples` changes the latter).
The table reports medians of per-process medians: total rendering time, time
until the first HTML chunk, renders per second, and process peak RSS in MiB.
Peak RSS includes the runtime, imports, warm-up and GC history; it is neither
retained heap nor memory allocated by one render. The first-chunk time covers
the renderer and consumer here, not network latency or browser paint.

A comparison includes a deterministic independent-process bootstrap 95%
interval for the ratio of median total times. An interval crossing zero delta
is reported as `unresolved`. This estimates sampling uncertainty only:
sequential before/after sessions can still drift. Repeat in the reverse order
before attributing a gain to code, and keep small changes provisional. These
are synthetic stress cases, not percentages to extrapolate to every page.
Saved JSON keeps the individual process results; keep it in `/tmp` or the
ignored `apps/bench/results/` directory rather than versioning local timings.

## Monitoring primitive precompile arrays

The `array-small`, `array-large` and `array-mixed` cases exercise `jsxEscape`
array holes: 16 escaped strings, 1,000 escaped strings, and 1,000 mixed text,
numeric, empty and trusted values. The tree-walk and precompile paths must emit
identical HTML before measurement. Existing `precompile` and
`realworld-precompile` cases also cover arrays of already-rendered markup.

A focused A/B can select cases without changing the harness's sampling budget:

```bash
# Run in apps/bench; A and B are frozen Core package roots with package.json + dist.
VINCLE_BENCH_CASES=array-small,array-large,array-mixed,precompile,realworld-precompile \
  bun run bench:stats -- --ab /tmp/core-after /tmp/core-before \
  --runs 8 --calibrate 2 --engines both --control @vincle/core --save results/core-arrays
```

Here the unchanged tree-walk implementation is the control for each precompile
case. The reference's paired ratio is therefore 1 by construction; it cannot
identify regressions in the reference itself. Use the full benchmark and its
competitor control when changing the ordinary renderer. The selected cases
also change the process context, so confirm small gains in the full benchmark
before applying them broadly. A/B artifacts record the selected engine and
case filter. Rerun the command locally to monitor later changes.

To select an explicit Node executable instead of the one on PATH, set
`VINCLE_BENCH_NODE` to its path (`node -p process.execPath` reports the binary
currently used by the shell). Both the ordinary Node series and Node A/B use
that path. A process that emits no JSON now produces an explicit error.
