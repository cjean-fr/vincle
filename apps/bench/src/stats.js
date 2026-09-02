/**
 * Repeated-run benchmark harness — N exécutions en processus frais, moyenne ±
 * écart-type, et delta exprimé en erreurs-types de la différence.
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

/** Erreur-type de la différence : le test porte sur la moyenne, donc `sd/√n`. */
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
  };
}

// Ratios mesurés dans le même processus : c'est ce qui survit au changement de
// machine, donc ce qui peut garder la CI. Ratio > 1 = vincle plus rapide.

async function measureOnce() {
  const proc = Bun.spawn(
    ["bun", "--conditions=dist", "run", `${import.meta.dir}/bench.js`, "--json"],
    { env: { ...process.env, NODE_ENV: "production" }, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`benchmark exited ${exitCode}\n${stderr}`);
  }
  // The JSON line is last; mitata may have written a banner before it.
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
 * @returns {Map<string, {case: string, name: string, mean: number, sd: number, n: number}>}
 */
function aggregate(runs) {
  const byKey = new Map();
  for (const run of runs) {
    for (const { case: kase, name, opsPerSec } of run) {
      const key = `${kase}\0${name}`;
      (byKey.get(key) ?? byKey.set(key, { case: kase, name, samples: [] }).get(key)).samples.push(
        opsPerSec,
      );
    }
  }
  const out = new Map();
  for (const [key, { case: kase, name, samples }] of byKey) {
    out.set(key, { case: kase, name, mean: mean(samples), sd: stdev(samples), n: samples.length });
  }
  return out;
}

const num = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function printTable(stats) {
  console.log(
    `\n${"case".padEnd(11)}${"implementation".padEnd(31)}${"mean ops/s".padStart(12)}` +
      `${"± sd".padStart(9)}${"cv".padStart(7)}${"vs ref".padStart(9)}`,
  );
  console.log("─".repeat(79));
  let refMean = 0;
  let currentCase = "";
  for (const s of stats.values()) {
    if (s.case !== currentCase) {
      if (currentCase) console.log();
      currentCase = s.case;
    }
    if (s.name === REF) refMean = s.mean;
    const ratio = s.name === REF ? "ref" : `×${(refMean / s.mean).toFixed(2)}`;
    console.log(
      `${(s.case === currentCase && s.name === REF ? s.case : "").padEnd(11)}` +
        `${s.name.padEnd(31)}${num(s.mean).padStart(12)}${num(s.sd).padStart(9)}` +
        `${((s.sd / s.mean) * 100).toFixed(1).padStart(6)}%${ratio.padStart(9)}`,
    );
  }
}

function printComparison(now, before) {
  console.log(
    `\n${"case".padEnd(11)}${"implementation".padEnd(31)}${"before".padStart(11)}` +
      `${"after".padStart(11)}${"delta".padStart(9)}${"sigmas".padStart(8)}  verdict`,
  );
  console.log("─".repeat(92));
  for (const [key, s] of now) {
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

let before;
if (opts.against !== undefined) {
  if (!existsSync(opts.against)) {
    console.error(`baseline not found: ${opts.against}`);
    process.exit(1);
  }
  const saved = JSON.parse(readFileSync(opts.against, "utf8"));
  before = new Map(saved.entries.map((e) => [`${e.case}\0${e.name}`, e]));
  console.log(`baseline: ${opts.against} (${saved.runs} runs, ${saved.recordedAt})`);
}

console.log(`measuring: ${opts.runs} runs in fresh processes…`);
const runs = [];
for (let i = 0; i < opts.runs; i++) {
  runs.push(await measureOnce());
  process.stdout.write(`\r  ${i + 1}/${opts.runs}`);
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
