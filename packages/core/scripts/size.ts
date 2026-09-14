/**
 * Report the published size of `@vincle/core` against its budget, split by what
 * each part is for.
 *
 * The budget is the tarball npm serves, because that is what the docs promise:
 * one package under 100 kB carrying the runtime and the whole attribute table,
 * against the 138 kB `csstype` costs on its own. The table ships twice — as
 * `src/jsx-namespace.ts` for the `bun` condition and as a `.d.mts` for every
 * other resolver — so it, not the runtime, is what moves this figure.
 *
 * `npm pack` decides what is published, so the file list comes from it rather
 * than from a second reading of `files` that could disagree with it.
 *
 * Per-kind gzip figures do not add up to the tarball, which compresses the
 * whole stream at once. The raw column is the one that sums.
 *
 * A script, not a test: growth is a judgement call, not a defect, so this never
 * fails the build — and a `test` that cannot fail is one the green bar counts
 * for nothing. Over budget it emits a GitHub annotation, so the run carries the
 * warning without blocking it.
 *
 * Reads `dist`, so it runs after a build. Missing artefacts *are* an error —
 * a silent skip is how a report stops reporting without anyone noticing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET = 100_000;
const PKG = join(import.meta.dir, "..");

if (!existsSync(join(PKG, "dist", "index.mjs"))) {
  console.error(
    "[size] no build to measure: packages/core/dist/index.mjs is missing. Run `bun run build` first.",
  );
  process.exit(1);
}

type Kind = "code" | "types" | "source" | "meta";

const KINDS: { kind: Kind; label: string; match: (path: string) => boolean }[] = [
  { kind: "code", label: "code   dist/*.mjs", match: (p) => p.endsWith(".mjs") },
  { kind: "types", label: "types  dist/*.d.mts", match: (p) => p.endsWith(".d.mts") },
  { kind: "source", label: "source index.ts, src/*.ts", match: (p) => p.endsWith(".ts") },
  { kind: "meta", label: "meta   package.json, README, LICENSE", match: () => true },
];

interface PackReport {
  size: number;
  unpackedSize: number;
  files: { path: string; size: number }[];
}

let packed: string;
try {
  packed = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: PKG,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch (cause) {
  console.error("[size] cannot list the published files: `npm pack --dry-run` failed.", cause);
  process.exit(1);
}
const [report] = JSON.parse(packed) as [PackReport];

const totals = new Map<Kind, { raw: number; gzip: number }>(
  KINDS.map(({ kind }) => [kind, { raw: 0, gzip: 0 }]),
);

for (const file of report.files) {
  const { kind } = KINDS.find(({ match }) => match(file.path))!;
  const total = totals.get(kind)!;
  total.raw += file.size;
  total.gzip += gzipSync(readFileSync(join(PKG, file.path))).length;
}

const kB = (bytes: number): string => `${(bytes / 1000).toFixed(1)} kB`;

console.log(
  `[size] @vincle/core: ${kB(report.size)} gzip / ${kB(BUDGET)} budget, ${kB(report.unpackedSize)} installed`,
);
for (const { kind, label } of KINDS) {
  const { raw, gzip } = totals.get(kind)!;
  console.log(`[size]   ${label.padEnd(36)} ${kB(raw).padStart(9)}  ${kB(gzip).padStart(8)} gzip`);
}

if (report.size > BUDGET) {
  const breakdown = KINDS.map(({ kind }) => `${kind} ${kB(totals.get(kind)!.gzip)}`).join(", ");
  const message =
    `@vincle/core is ${kB(report.size)} gzip, over the ${kB(BUDGET)} budget — ` +
    `the docs promise "under 100 kB gzip". Raise the budget and correct them, or trim. (${breakdown})`;

  if (process.env["GITHUB_ACTIONS"] === "true") {
    console.log(`::warning title=Package size::${message}`);
  } else {
    console.warn(`[size] ${message}`);
  }
}
