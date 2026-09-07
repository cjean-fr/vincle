/**
 * Repeated-run benchmark harness — N runs in fresh processes, mean ± standard
 * deviation, and a delta expressed in standard errors of the difference.
 *
 * Usage:
 *   bun run bench:stats                          # measure, print table
 *   bun run bench:stats -- --save base.json      # measure and save
 *   bun run bench:stats -- --against base.json   # measure and compare
 *   bun run bench:stats -- --runs 12
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const REF = "@vincle/core";

/** Below this many standard errors of the difference, a delta is not a finding. */
const SIGNIFICANCE_SIGMAS = 3;

/** Standard error of the difference: the test is on the mean, hence `sd/√n`. */
function stdErrOfDiff(a, b) {
  return Math.sqrt(a.sd ** 2 / Math.max(1, a.n) + b.sd ** 2 / Math.max(1, b.n));
}

function parseArgs(argv) {
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  return {
    runs: Number(flag("runs") ?? 8),
    save: flag("save"),
    against: flag("against"),
    engines: flag("engines") ?? "bun",
  };
}

/**
 * How each engine is asked to run the benchmark.
 *
 * Both, on demand rather than by default: an effect present under JSC **and** V8
 * is structural, one present under a single engine is that engine's own
 * deoptimisation — but the daily question is "did I break something", and paying
 * two engines for it doubles the wait.
 */
const ENGINES = {
  bun: (file) => ["bun", "--conditions=dist", "run", file, "--json"],
  node: (file) => ["node", "--conditions=dist", file, "--json"],
};

// Ratios measured in the same process: that is what survives a change of
// machine, and what CI could keep. Ratio > 1 = vincle is faster.

async function measureOnce(engine) {
  const proc = Bun.spawn(ENGINES[engine](`${import.meta.dir}/bench.js`), {
    env: { ...process.env, NODE_ENV: "production" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`benchmark exited ${exitCode} under ${engine}\n${stderr}`);
  }
  // The JSON is the last line; the runtime may print before it.
  const line = stdout.trimEnd().split("\n").at(-1);
  return JSON.parse(line);
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Aggregate raw runs into one entry per (case, name).
 *
 * The ratio is taken INSIDE each process, then averaged: the machine's mood is
 * common to both terms and divides out. A ratio of two aggregate means keeps the
 * noise of both, and has no standard deviation of its own.
 *
 * @returns {Map<string, {engine: string, case: string, name: string, mean: number, sd: number, n: number, ratio?: number, ratioSd?: number}>}
 */
function aggregate(runs) {
  const byKey = new Map();
  for (const { engine, rows } of runs) {
    const refOf = new Map();
    for (const { case: kase, name, opsPerSec } of rows) {
      if (name === REF) refOf.set(kase, opsPerSec);
    }
    for (const { case: kase, name, opsPerSec } of rows) {
      const key = `${engine}\0${kase}\0${name}`;
      const entry =
        byKey.get(key) ??
        byKey.set(key, { engine, case: kase, name, samples: [], ratios: [] }).get(key);
      entry.samples.push(opsPerSec);
      const ref = refOf.get(kase);
      if (name !== REF && ref !== undefined) entry.ratios.push(ref / opsPerSec);
    }
  }
  const out = new Map();
  for (const [key, { engine, case: kase, name, samples, ratios }] of byKey) {
    out.set(key, {
      engine,
      case: kase,
      name,
      mean: mean(samples),
      sd: stdev(samples),
      n: samples.length,
      ratio: ratios.length === 0 ? undefined : mean(ratios),
      ratioSd: ratios.length === 0 ? undefined : stdev(ratios),
    });
  }
  return out;
}

const num = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function printTable(stats) {
  console.log(
    `\n${"case".padEnd(11)}${"implementation".padEnd(31)}${"mean ops/s".padStart(12)}` +
      `${"± sd".padStart(9)}${"cv".padStart(7)}${"vs ref".padStart(14)}`,
  );
  console.log("─".repeat(84));
  let currentCase = "";
  let currentEngine = "";
  for (const s of stats.values()) {
    if (s.engine !== currentEngine) {
      console.log(`${currentEngine === "" ? "" : "\n"}── ${s.engine} ──`);
      currentEngine = s.engine;
      currentCase = "";
    }
    if (s.case !== currentCase) {
      if (currentCase) console.log();
      currentCase = s.case;
    }
    const ratio =
      s.name === REF
        ? "ref"
        : s.ratio === undefined
          ? "—"
          : `×${s.ratio.toFixed(2)} ± ${s.ratioSd.toFixed(2)}`;
    console.log(
      `${(s.case === currentCase && s.name === REF ? s.case : "").padEnd(11)}` +
        `${s.name.padEnd(31)}${num(s.mean).padStart(12)}${num(s.sd).padStart(9)}` +
        `${((s.sd / s.mean) * 100).toFixed(1).padStart(6)}%${ratio.padStart(14)}`,
    );
  }
}

function printComparison(now, before) {
  console.log(
    `\n${"case".padEnd(11)}${"implementation".padEnd(31)}${"before".padStart(11)}` +
      `${"after".padStart(11)}${"delta".padStart(9)}${"sigmas".padStart(8)}  verdict`,
  );
  console.log("─".repeat(92));
  let currentEngine = "";
  for (const [key, s] of now) {
    if (s.engine !== currentEngine) {
      console.log(`${currentEngine === "" ? "" : "\n"}── ${s.engine} ──`);
      currentEngine = s.engine;
    }
    const b = before.get(key);
    if (b === undefined) {
      console.log(
        `${s.case.padEnd(11)}${s.name.padEnd(31)}${"—".padStart(11)}${num(s.mean).padStart(11)}${"".padStart(17)}  new case`,
      );
      continue;
    }
    const se = stdErrOfDiff(s, b);
    const sigmas = se === 0 ? Infinity : Math.abs(s.mean - b.mean) / se;
    const delta = ((s.mean - b.mean) / b.mean) * 100;
    const verdict =
      sigmas < SIGNIFICANCE_SIGMAS ? "noise — not a finding" : delta > 0 ? "faster" : "SLOWER";
    console.log(
      `${s.case.padEnd(11)}${s.name.padEnd(31)}${num(b.mean).padStart(11)}${num(s.mean).padStart(11)}` +
        `${(delta >= 0 ? "+" : "") + delta.toFixed(1)}%`.padStart(9) +
        `${sigmas === Infinity ? "∞" : sigmas.toFixed(1)}`.padStart(8) +
        `  ${verdict}`,
    );
  }
  console.log(
    `\n  A delta under ${SIGNIFICANCE_SIGMAS}σ is indistinguishable from between-run variance.` +
      ` Raise --runs to resolve it,\n  or accept that the change is not measurable and decide on other grounds.`,
  );
}

// ── main ────────────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
if (!Number.isInteger(opts.runs) || opts.runs < 2) {
  console.error("--runs must be an integer ≥ 2; a single run cannot yield a standard deviation.");
  process.exit(1);
}

const engines = opts.engines === "both" ? ["bun", "node"] : [opts.engines];
if (engines.some((engine) => ENGINES[engine] === undefined)) {
  console.error(`--engines must be one of: bun, node, both (got "${opts.engines}")`);
  process.exit(1);
}

let before;
if (opts.against !== undefined) {
  if (!existsSync(opts.against)) {
    console.error(`baseline not found: ${opts.against}`);
    process.exit(1);
  }
  const saved = JSON.parse(readFileSync(opts.against, "utf8"));
  // A baseline recorded before `--engines` existed carries no engine and was bun.
  before = new Map(saved.entries.map((e) => [`${e.engine ?? "bun"}\0${e.case}\0${e.name}`, e]));
  console.log(`baseline: ${opts.against} (${saved.runs} runs, ${saved.recordedAt})`);
}

console.log(`measuring: ${opts.runs} runs in fresh processes, under ${engines.join(" and ")}…`);
const runs = [];
for (const engine of engines) {
  for (let i = 0; i < opts.runs; i++) {
    runs.push({ engine, rows: await measureOnce(engine) });
    process.stdout.write(`\r  ${engine} ${i + 1}/${opts.runs}`);
  }
}
process.stdout.write("\r".padEnd(20) + "\r");

const stats = aggregate(runs);

if (before === undefined) printTable(stats);
else printComparison(stats, before);

if (opts.save !== undefined) {
  writeFileSync(
    opts.save,
    JSON.stringify(
      { recordedAt: new Date().toISOString(), runs: opts.runs, entries: [...stats.values()] },
      null,
      2,
    ),
  );
  console.log(`\nsaved: ${opts.save}`);
}
