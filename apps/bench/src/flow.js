import { jsx } from "@vincle/core/jsx-runtime";
import { Defer, Slot, renderToStream } from "@vincle/flow";
import { HtmxAdapter } from "@vincle/flow/adapters";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const scenarios = ["markers-100", "markers-1000", "nested-1500", "chunks-2000", "slow-reader"];
const median = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Independent-process bootstrap: sampling uncertainty only, not drift between sessions.
function timeInterval(before, after) {
  let seed = 42;
  const pick = (rows) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return rows[Math.floor((seed / 4294967296) * rows.length)].totalMs;
  };
  const ratios = [];
  for (let i = 0; i < 2000; i++) {
    ratios.push(median(after.map(() => pick(after))) / median(before.map(() => pick(before))));
  }
  ratios.sort((a, b) => a - b);
  return [ratios[50], ratios[1949]];
}

function page(name) {
  if (name.startsWith("markers-")) {
    const count = Number(name.split("-")[1]);
    return () =>
      jsx("html", {
        children: jsx("body", {
          children: Array.from({ length: count }, (_, index) => [
            jsx("p", { children: "x".repeat(256) }),
            jsx(Defer, { target: `f-${index}`, children: "patch" }),
            jsx(Slot, { name: `f-${index}`, children: "loading" }),
          ]),
        }),
      });
  }
  if (name.startsWith("nested-")) {
    const count = Number(name.split("-")[1]);
    const nested = (index) =>
      jsx(Defer, {
        target: `f-${index}`,
        children: () => (index + 1 < count ? nested(index + 1) : "end"),
      });
    return () => nested(0);
  }
  const count = name === "slow-reader" ? 30 : 2000;
  async function* chunks() {
    for (let index = 0; index < count; index++) yield "chunk";
  }
  return () => jsx(Defer, { target: "feed", merge: "append", children: chunks() });
}

async function sample(name) {
  const start = performance.now();
  const reader = renderToStream(page(name), HtmxAdapter).getReader();
  let firstMs;
  let characters = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      firstMs ??= performance.now() - start;
      characters += value.length; // Fixtures are ASCII, so characters equal wire bytes.
      if (name === "slow-reader") await sleep(1);
    }
  } finally {
    reader.releaseLock();
  }
  return { totalMs: performance.now() - start, firstMs: firstMs ?? 0, bytes: characters };
}

async function main() {
  if (process.argv.includes("--worker")) {
    const name = option("--worker");
    if (!scenarios.includes(name)) throw new Error("Unknown Flow scenario");
    const samples = Number(option("--samples"));
    for (let i = 0; i < 2; i++) await sample(name);
    const results = [];
    for (let i = 0; i < samples; i++) results.push(await sample(name));
    console.log(
      JSON.stringify({
        totalMs: median(results.map((r) => r.totalMs)),
        firstMs: median(results.map((r) => r.firstMs)),
        bytes: results[0].bytes,
        peakRssMiB: process.resourceUsage().maxRSS / 1024,
      }),
    );
    return;
  }
  const runs = process.argv.includes("--runs") ? Number(option("--runs")) : 8;
  const samples = process.argv.includes("--samples") ? Number(option("--samples")) : 5;
  if (!Number.isInteger(runs) || runs < 2 || !Number.isInteger(samples) || samples < 1)
    throw new Error("Use --runs >= 2 and --samples >= 1");
  const previous = process.argv.includes("--against")
    ? JSON.parse(await readFile(option("--against"), "utf8"))
    : undefined;
  if (
    previous &&
    (previous.schema !== 1 ||
      previous.samples !== samples ||
      previous.runtime !== process.version ||
      (previous.bunVersion && previous.bunVersion !== Bun.version))
  )
    throw new Error("Baseline must use the same schema, runtime and sample count");
  const records = Object.fromEntries(scenarios.map((name) => [name, []]));
  for (let run = 0; run < runs; run++) {
    // Reverse scenario order on alternate runs to reduce systematic position effects.
    for (const name of run % 2 ? scenarios.toReversed() : scenarios) {
      const child = Bun.spawn(
        [
          process.execPath,
          "--conditions=dist",
          fileURLToPath(import.meta.url),
          "--worker",
          name,
          "--samples",
          String(samples),
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (code) throw new Error(stderr);
      records[name].push(JSON.parse(stdout));
    }
  }
  const summary = Object.fromEntries(
    scenarios.map((name) => {
      const rows = records[name];
      if (rows.some((row) => row.bytes !== rows[0].bytes))
        throw new Error(`Wire size varies between runs for ${name}`);
      return [
        name,
        {
          totalMs: median(rows.map((r) => r.totalMs)),
          firstMs: median(rows.map((r) => r.firstMs)),
          peakRssMiB: median(rows.map((r) => r.peakRssMiB)),
          bytes: rows[0].bytes,
        },
      ];
    }),
  );
  console.table(
    scenarios.map((name) => {
      const current = summary[name];
      const old = previous?.summary[name];
      if (old && old.bytes !== current.bytes) throw new Error(`Wire size changed for ${name}`);
      const interval = old ? timeInterval(previous.records[name], records[name]) : undefined;
      return {
        scenario: name,
        "total ms": current.totalMs.toFixed(2),
        "first chunk ms": current.firstMs.toFixed(2),
        "renders/s": (1000 / current.totalMs).toFixed(0),
        "process peak RSS MiB": current.peakRssMiB.toFixed(1),
        "time delta": old ? `${((current.totalMs / old.totalMs - 1) * 100).toFixed(1)}%` : "—",
        "95% interval": interval
          ? interval.map((ratio) => `${((ratio - 1) * 100).toFixed(1)}%`).join(" to ")
          : "—",
        verdict: interval
          ? interval[0] <= 1 && interval[1] >= 1
            ? "unresolved"
            : "measured delta"
          : "—",
      };
    }),
  );
  if (process.argv.includes("--save"))
    await writeFile(
      option("--save"),
      JSON.stringify(
        {
          schema: 1,
          runtime: process.version,
          bunVersion: Bun.version,
          samples,
          runs,
          summary,
          records,
        },
        null,
        2,
      ) + "\n",
    );
}

await main();
