/**
 * The A/B crossover engine answers whether build A is faster than build B.
 *
 * The unit is the pair, and the quantity is A relative to B. Three things keep
 * the pair readable on a shared machine, where a single run is not a
 * measurement:
 *
 *   - the ratio is taken INSIDE each process, against a competitor control that
 *     runs the same code in both builds. The machine's mood in process i is
 *     common to numerator and denominator and divides out; only the mood
 *     *difference between the two processes of a pair* remains, and that is
 *     small because the pair is adjacent in time.
 *   - the pair order alternates (A-then-B, B-then-A, …): each build is the
 *     first process of its pair half the time. This keeps position effects, such
 *     as a warming CPU, warm caches, or a ramping frequency, separate from the build.
 *   - the verdict is on the PAIRED ratio, not on two session means. The
 *     `--save`/`--against` path compares two sessions and inherits their drift;
 *     a pair measures A and B in one session, so the drift has no room.
 *
 * p = (A_vincle / A_control) / (B_vincle / B_control). p > 1 means A is faster.
 * A case with no control (the `precompile` case, which has no competitor) falls
 * back to the raw A/B and is flagged, because there nothing divides the machine
 * out.
 *
 * A and B are package roots (package.json + dist/), built once each and then
 * frozen. To run both through the same bench without touching the workspace,
 * each build gets a throwaway sandbox: a copy of this app whose node_modules
 * points `@vincle/core` at that build and every other dependency at the
 * workspace's. The bench files are copied, not symlinked: resolution follows
 * the real path of the importer, so a symlinked bench.js would still resolve
 * from the workspace. A/B therefore runs under the bun engine only: it spawns
 * `bun` on the sandbox.
 *
 * Used by `stats.js --ab` (pre-built package roots) and by `compare.ts` (git
 * revisions, built hermetically).
 */

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

export const REF = "@vincle/core";

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

const SB_DEPS = [
  "@kitajs/html",
  "hono",
  "mitata",
  "preact",
  "preact-render-to-string",
  "react",
  "react-dom",
];

/**
 * Build the sandbox for one build. Returns the sandbox root. The sandbox is
 * the only place `@vincle/core` resolves to anything other than the
 * workspace's current dist.
 */
function setupSandbox(buildRoot) {
  const appRoot = resolve(import.meta.dir, "..");
  const sandbox = mkdtempSync(`${tmpdir()}/vincle-ab-`);
  const nm = resolve(sandbox, "node_modules");
  const wsNM = resolve(appRoot, "node_modules");
  const link = (dep, target) => {
    const dest = resolve(nm, dep);
    if (dep.includes("/")) mkdirSync(dirname(dest), { recursive: true });
    symlinkSync(target, dest);
  };
  for (const dep of SB_DEPS) link(dep, realpathSync(resolve(wsNM, dep)));
  link("@vincle/core", realpathSync(buildRoot));
  cpSync(import.meta.dir, resolve(sandbox, "src"), { recursive: true });
  copyFileSync(resolve(appRoot, "package.json"), resolve(sandbox, "package.json"));
  return sandbox;
}

async function abMeasureOnce(benchPath) {
  const proc = Bun.spawn(["bun", "--conditions=dist", benchPath, "--json"], {
    env: { ...process.env, NODE_ENV: "production" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`benchmark exited ${exitCode}\n${stderr}`);
  }
  const line = stdout.trimEnd().split("\n").at(-1);
  return JSON.parse(line);
}

/** rows → Map "case\0name" → opsPerSec. */
const opsMap = (rows) => new Map(rows.map((r) => [`${r.case}\0${r.name}`, r.opsPerSec]));

/**
 * The control's ops/s for one case, in one process. `all` is the geometric mean
 * of every competitor present (averaging their individual jitter), a name is
 * that competitor, `none` is no control.
 */
function controlOps(ops, kase, mode) {
  if (mode === "none") return undefined;
  if (mode !== "all") return ops.get(`${kase}\0${mode}`);
  const vals = [...ops.entries()]
    .filter(([k]) => {
      const [c, name] = k.split("\0");
      return c === kase && !name.startsWith(REF);
    })
    .map(([, v]) => v);
  if (vals.length === 0) return undefined;
  return Math.exp(vals.reduce((a, v) => a + Math.log(v), 0) / vals.length);
}

/**
 * One pair: the ops maps of the run that ran A and of the run that ran B.
 * Returns, per library entry, p = (A/control)/(B/control), or the raw A/B when
 * the case has no control: plus whether the control was in play.
 */
function pairRatios(opsA, opsB, control) {
  const out = new Map(); // "case\0name" → { p, controlled }
  for (const [key, aV] of opsA) {
    const [kase, name] = key.split("\0");
    if (!name.startsWith(REF)) continue; // competitors are the control, not the subject
    const bV = opsB.get(key);
    if (bV === undefined) continue;
    const aC = controlOps(opsA, kase, control);
    const bC = controlOps(opsB, kase, control);
    if (aC !== undefined && bC !== undefined)
      out.set(key, { p: aV / aC / (bV / bC), controlled: true });
    else out.set(key, { p: aV / bV, controlled: false });
  }
  return out;
}

const median = (xs) => {
  const s = xs.toSorted((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * 95% bootstrap confidence interval of the median, resampling PAIRS: the
 * machine's mood varies pair to pair, not within a pair, so the pair is the
 * resampling unit. Seeded so a saved re-analysis prints the same interval.
 */
function bootstrapMedianCI(ps, nBoot = 4000, seed = 0x9e3779b9) {
  const n = ps.length;
  if (n < 3) return [Math.min(...ps), Math.max(...ps)];
  let s = seed >>> 0;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const meds = Array.from({ length: nBoot });
  for (let b = 0; b < nBoot; b++) {
    const res = Array.from({ length: n });
    for (let i = 0; i < n; i++) res[i] = ps[(rand() * n) | 0];
    meds[b] = median(res);
  }
  meds.sort((a, b) => a - b);
  return [meds[Math.floor(0.025 * nBoot)], meds[Math.ceil(0.975 * nBoot) - 1]];
}

/**
 * Run the A/B crossover between two built package roots and print the verdict.
 * `control`: "all" (geometric mean of the competitors), "none", or a
 * competitor's name. `calibrate`: A/A pairs to measure the design's noise
 * floor. `save`: where to keep the paired ratios for re-analysis.
 */
export async function abMain(aDir, bDir, control, runs, calibrate, save) {
  for (const [label, dir] of [
    ["A", aDir],
    ["B", bDir],
  ]) {
    if (!existsSync(resolve(dir, "package.json"))) {
      console.error(
        `${label}: no package.json in ${dir}: pass a package root (package.json + dist/)`,
      );
      process.exit(1);
    }
  }

  const sandboxA = setupSandbox(aDir);
  const sandboxB = setupSandbox(bDir);
  const calPairs = [];
  const abPairs = [];
  try {
    // Two throwaway runs first: the calibration runs before the A/B pairs, so
    // if the machine is still coming off the cold start: page cache, governor
    // ramp: it would sample the ramp, not the steady state, and overstate
    // σ_pair for pairs that actually run in the steady state.
    console.log("warming up: 2 throwaway runs …");
    await abMeasureOnce(resolve(sandboxA, "src", "bench.js"));
    await abMeasureOnce(resolve(sandboxA, "src", "bench.js"));

    // One pair: two adjacent fresh processes. `aFirst` is the alternation.
    const runPair = async (sbA, sbB, aFirst) => {
      const first = await abMeasureOnce(resolve(aFirst ? sbA : sbB, "src", "bench.js"));
      const second = await abMeasureOnce(resolve(aFirst ? sbB : sbA, "src", "bench.js"));
      const opsA = aFirst ? opsMap(first) : opsMap(second);
      const opsB = aFirst ? opsMap(second) : opsMap(first);
      return pairRatios(opsA, opsB, control);
    };

    if (calibrate > 0) {
      console.log(`calibrating: ${calibrate} A/A pairs: the noise floor of the design itself …`);
      for (let i = 0; i < calibrate; i++) {
        calPairs.push(await runPair(sandboxA, sandboxA, i % 2 === 0));
        process.stdout.write(`\r  cal ${i + 1}/${calibrate}`);
      }
      process.stdout.write("\r".padEnd(24) + "\r");
    }

    console.log(`measuring: ${runs} A/B pairs, order alternating …`);
    for (let i = 0; i < runs; i++) {
      abPairs.push(await runPair(sandboxA, sandboxB, i % 2 === 0));
      process.stdout.write(`\r  ab  ${i + 1}/${runs}`);
    }
    process.stdout.write("\r".padEnd(24) + "\r");
  } finally {
    rmSync(sandboxA, { recursive: true, force: true });
    rmSync(sandboxB, { recursive: true, force: true });
  }

  const entries = [];
  const entryFor = (key) => {
    let e = entries.find((x) => x.key === key);
    if (!e) {
      const [kase, name] = key.split("\0");
      e = { key, case: kase, name, controlled: true, ps: [], calPs: [] };
      entries.push(e);
    }
    return e;
  };
  for (const pair of abPairs) {
    for (const [key, { p, controlled }] of pair) {
      const e = entryFor(key);
      e.ps.push(p);
      e.controlled = e.controlled && controlled;
    }
  }
  for (const pair of calPairs) {
    for (const [key, { p }] of pair) {
      const e = entries.find((x) => x.key === key);
      if (e) e.calPs.push(p);
    }
  }

  const controlLabel =
    control === "all"
      ? "geometric mean of the competitors"
      : control === "none"
        ? "none (raw)"
        : control;
  console.log(`\n  A vs B: p > 1 means A is faster. Control: ${controlLabel}.\n`);
  console.log(
    `${"case".padEnd(11)}${"entry".padEnd(26)}${"A vs B".padStart(9)}` +
      `${"95% CI".padStart(21)}${"pairs A>B".padStart(11)}${"σ_pair".padStart(9)}${"resolvable".padStart(12)}  verdict`,
  );
  console.log("─".repeat(100));
  let currentCase = "";
  for (const e of entries) {
    if (e.case !== currentCase) {
      if (currentCase) console.log();
      currentCase = e.case;
    }
    e.median = median(e.ps);
    e.ci = bootstrapMedianCI(e.ps);
    e.fasterA = e.ps.filter((p) => p > 1).length;
    // σ of the log-ratio: ratios are multiplicative, so the noise floor lives in
    // log space, and "resolvable" is the delta that is 3σ above it at n = runs.
    const logSd = e.calPs.length >= 2 ? stdev(e.calPs.map(Math.log)) : undefined;
    e.verdict = e.ci[0] > 1 ? "A faster" : e.ci[1] < 1 ? "B faster" : "no finding";
    const sigma = logSd === undefined ? "-" : `${(logSd * 100).toFixed(1)}%`;
    const resolvable =
      logSd === undefined
        ? "-"
        : `${((Math.exp((3 * logSd) / Math.sqrt(runs)) - 1) * 100).toFixed(1)}%`;
    console.log(
      `${e.case.padEnd(11)}${e.name.padEnd(26)}` +
        `×${e.median.toFixed(3)}`.padStart(9) +
        `[${e.ci[0].toFixed(3)}, ${e.ci[1].toFixed(3)}]`.padStart(21) +
        `${e.fasterA}/${e.ps.length}`.padStart(11) +
        `${sigma.padStart(9)}` +
        `${resolvable.padStart(12)}` +
        `${e.controlled ? "" : "  (raw)"}  ${e.verdict}`,
    );
  }
  console.log(
    `\n  The pair is the resampling unit. σ_pair is the A/A noise floor; "resolvable" is the smallest\n` +
      `  delta 3σ can separate at ${runs} pairs: it falls as 1/√n. A delta smaller than that is below the\n` +
      `  floor: raise --runs, or accept it is not measurable and decide on other grounds. (raw) rows have\n` +
      `  no control and are not divided by the machine: treat them as a glance, not a verdict.\n`,
  );

  if (save !== undefined) {
    writeFileSync(
      save,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          mode: "ab",
          a: aDir,
          b: bDir,
          control,
          runs,
          calibrate,
          entries: entries.map((e) => ({
            case: e.case,
            name: e.name,
            controlled: e.controlled,
            ps: e.ps,
            calPs: e.calPs,
          })),
        },
        null,
        2,
      ),
    );
    console.log(`\nsaved: ${save}`);
  }
}
