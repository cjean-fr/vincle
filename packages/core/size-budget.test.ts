import { describe, it } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// The docs promise "under 10 KB gzip" (README, guide/faq, guide/introduction).
// The figure had drifted from 14 to 17.2 kB unnoticed before anyone measured it.
//
// Reports, never fails: growth is a judgement call, not a defect. Over budget it
// emits a GitHub annotation so the run carries the warning without blocking it.
const BUDGET = 10_000;

const DIST = join(import.meta.dir, "dist");

describe("package size", () => {
  // `bun run test` does not build the package under test, and one CI job runs the
  // suite with nothing built at all.
  const onBuiltArtefact = existsSync(join(DIST, "index.mjs")) ? it : it.skip;

  onBuiltArtefact("reported against the documented budget", () => {
    const sizes = readdirSync(DIST)
      .filter((f) => f.endsWith(".mjs"))
      .map((file) => ({ file, gzip: gzipSync(readFileSync(join(DIST, file))).length }))
      .toSorted((a, b) => b.gzip - a.gzip);
    const total = sizes.reduce((sum, f) => sum + f.gzip, 0);

    console.log(`[size] @vincle/core: ${total} B gzip / ${BUDGET} B budget`);
    if (total <= BUDGET) return;

    const breakdown = sizes.map((f) => `${f.file} ${f.gzip} B`).join(", ");
    const message =
      `@vincle/core is ${total} B gzip, over the ${BUDGET} B budget — ` +
      `the docs promise "under 10 KB gzip". Raise the budget and correct them, or trim. (${breakdown})`;

    if (process.env["GITHUB_ACTIONS"] === "true") {
      console.log(`::warning title=Package size::${message}`);
    } else {
      console.warn(`[size] ${message}`);
    }
  });
});
