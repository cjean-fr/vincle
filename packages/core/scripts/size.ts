/**
 * Report the published size of `@vincle/core` against the budget the docs
 * promise ("under 10 KB gzip" — README, guide/faq, guide/introduction). The
 * figure had drifted from 14 to 17.2 kB unnoticed before anyone measured it.
 *
 * A script, not a test: growth is a judgement call, not a defect, so this never
 * fails the build — and a `test` that cannot fail is one the green bar counts
 * for nothing. Over budget it emits a GitHub annotation, so the run carries the
 * warning without blocking it.
 *
 * Reads `dist`, so it runs after a build. Missing artefacts *are* an error —
 * a silent skip is how a report stops reporting without anyone noticing.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET = 10_000;
const DIST = join(import.meta.dir, "..", "dist");

if (!existsSync(join(DIST, "index.mjs"))) {
  console.error(
    "[size] no build to measure: packages/core/dist/index.mjs is missing. Run `bun run build` first.",
  );
  process.exit(1);
}

const sizes = readdirSync(DIST)
  .filter((f) => f.endsWith(".mjs"))
  .map((file) => ({ file, gzip: gzipSync(readFileSync(join(DIST, file))).length }))
  .toSorted((a, b) => b.gzip - a.gzip);

const total = sizes.reduce((sum, f) => sum + f.gzip, 0);
console.log(`[size] @vincle/core: ${total} B gzip / ${BUDGET} B budget`);

if (total > BUDGET) {
  const breakdown = sizes.map((f) => `${f.file} ${f.gzip} B`).join(", ");
  const message =
    `@vincle/core is ${total} B gzip, over the ${BUDGET} B budget — ` +
    `the docs promise "under 10 KB gzip". Raise the budget and correct them, or trim. (${breakdown})`;

  if (process.env["GITHUB_ACTIONS"] === "true") {
    console.log(`::warning title=Package size::${message}`);
  } else {
    console.warn(`[size] ${message}`);
  }
}
