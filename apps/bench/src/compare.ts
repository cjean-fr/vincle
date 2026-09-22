/**
 * Compare builds <a> and <b> to see which is faster.
 *
 *   bun run compare                     # origin/main vs the working tree
 *   bun run compare <a>                 # <a> vs the working tree
 *   bun run compare <a> <b>             # two revisions
 *
 * a and b are git refs (origin/main, a branch, a tag, a hash, HEAD~3 …) or
 * "." for the working tree. a defaults to origin/main, b to the working
 * tree, so the plain invocation answers "did my current change make it
 * faster than main".
 *
 * Each side is measured from a hermetic mini-CI build, never from the local
 * dist. The build copies packages/core and packages/typescript-config, which
 * supplies the base tsconfig that packages/core extends,
 * are copied WITHOUT node_modules into a throwaway workspace, then
 * `bun install` and `bun run build`, the way CI builds them. What is measured
 * is what a clean checkout of that revision would publish, whatever the local
 * node_modules has drifted into.
 *
 * The verdict is the A/B crossover in ab.js: paired adjacent fresh processes,
 * the order alternating, each ratio taken inside the process against a
 * competitor control, and the CI on the median of the paired ratios.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { abMain } from "./ab.js";

// The two source folders the build of packages/core needs: the package, and
// the shared tsconfig base its tsconfig.json extends (the only thing the
// build reads outside the package).
const FOLDERS = ["packages/core", "packages/typescript-config"] as const;

// Generated, never source. Copied in and a build that failed halfway would
// leave a stale dist that still answers `--conditions=dist`: tsdown's
// `clean: true` only protects a build that actually runs.
const WORKDIR_EXCLUDES = [
  "packages/core/node_modules",
  "packages/core/dist",
  "packages/core/coverage",
  "packages/core/reports",
  "packages/core/badges",
];

const WORKDIR_TOKENS = new Set([".", "wd", "workdir", "worktree"]);

type Side = { kind: "commit"; hash: string; ref: string } | { kind: "workdir" };

const git = (args: string[], cwd?: string) =>
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] })
    .toString()
    .trim();

function refToHash(ref: string): string | undefined {
  const r = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return r.status === 0 ? r.stdout.toString().trim() : undefined;
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("--")) flags.set(a.slice(2), argv[++i] ?? "");
    else positional.push(a);
  }
  const num = (name: string, dflt: number) => {
    const v = flags.get(name);
    return v === undefined ? dflt : Number(v);
  };
  return {
    positional,
    a: positional[0],
    b: positional[1],
    runs: num("runs", 8),
    calibrate: num("calibrate", 3),
    control: flags.get("control") ?? "all",
    save: flags.get("save"),
  };
}

function resolveSide(arg: string | undefined, label: string, fallback: "commit" | "workdir"): Side {
  const tok = arg ?? (fallback === "commit" ? "origin/main" : ".");
  if (WORKDIR_TOKENS.has(tok)) return { kind: "workdir" };
  const hash = refToHash(tok);
  if (hash) return { kind: "commit", hash, ref: tok };
  console.error(
    `${label}: "${tok}" is neither a git ref nor the working tree (".", "workdir"). ` +
      `Pass a branch, a tag, a hash, "origin/main", or "." for the working tree.`,
  );
  process.exit(1);
}

function describe(side: Side, root: string): string {
  if (side.kind === "workdir") {
    const head = git(["rev-parse", "HEAD"], root).slice(0, 7);
    const dirty = git(["status", "--porcelain", ...FOLDERS], root);
    return `working tree @ ${head}${dirty ? " (uncommitted changes under the measured folders)" : ""}`;
  }
  const subject = git(["log", "-1", "--format=%s", side.hash], root);
  return `${side.ref} @ ${side.hash.slice(0, 7)}: ${subject}`;
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn([cmd, ...args], {
    cwd,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return proc.exited.then((code) => {
    if (code !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${code} in ${cwd}`);
  });
}

/**
 * Copy the side's sources without vendor into a throwaway mini workspace and
 * build them the way CI does. Returns the built package root.
 */
async function prepareSide(side: Side, root: string, temps: string[]): Promise<string> {
  const tmp = mkdtempSync(`${tmpdir()}/vincle-cmp-`);
  temps.push(tmp);
  const pkgDir = resolve(tmp, "packages/core");
  mkdirSync(resolve(tmp, "packages"), { recursive: true });
  const tar = resolve(tmp, "src.tar");

  if (side.kind === "commit") {
    // A git archive of the two folders at the revision: no vendor, no local state.
    execFileSync("git", ["archive", side.hash, ...FOLDERS, "-o", tar], { cwd: root });
    execFileSync("tar", ["-xf", tar, "-C", tmp]);
  } else {
    // The live tree, minus everything generated.
    execFileSync("tar", [
      "-C",
      root,
      "-cf",
      tar,
      ...WORKDIR_EXCLUDES.map((e) => `--exclude=${e}`),
      ...FOLDERS,
    ]);
    execFileSync("tar", ["-xf", tar, "-C", tmp]);
  }
  rmSync(tar);
  if (!existsSync(resolve(pkgDir, "package.json")))
    throw new Error(`${tmp}: packages/core did not come through`);

  // The mini workspace: one package, and the repo's own catalog so `catalog:`
  // resolves to the versions the repo pins, not whatever is newest.
  const rootPkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  writeFileSync(
    resolve(tmp, "package.json"),
    JSON.stringify(
      {
        name: "vincle-mini-ci",
        private: true,
        type: "module",
        workspaces: { packages: ["packages/*"], catalog: rootPkg.workspaces?.catalog ?? {} },
      },
      null,
      2,
    ),
  );
  const bunfig = resolve(root, "bunfig.toml");
  if (existsSync(bunfig)) copyFileSync(bunfig, resolve(tmp, "bunfig.toml"));

  await run("bun", ["install"], tmp);
  await run("bun", ["run", "build"], pkgDir);
  if (!existsSync(resolve(pkgDir, "dist/index.mjs")))
    throw new Error(`${tmp}: the build produced no dist/index.mjs`);
  return pkgDir;
}

// ── main ────────────────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));
if (!Number.isInteger(opts.runs) || opts.runs < 2) {
  console.error("--runs must be an integer ≥ 2; a single run cannot yield a standard deviation.");
  process.exit(1);
}
if (opts.positional.length > 2) {
  console.error(
    "usage: bun run compare [<a>] [<b>] [--runs n] [--calibrate n] [--control x] [--save f]",
  );
  process.exit(1);
}

const root = git(["rev-parse", "--show-toplevel"]);
const sideA = resolveSide(opts.a, "a", "commit");
const sideB = resolveSide(opts.b, "b", "workdir");

// Comparing a revision with itself, or with a clean working tree at that
// revision, yields no comparison. A dirty working tree at the same HEAD
// does have a change to measure.
const head = git(["rev-parse", "HEAD"], root);
const treeDirty = git(["status", "--porcelain", ...FOLDERS], root) !== "";
const sameTree =
  (sideA.kind === "workdir" && sideB.kind === "workdir") ||
  (sideA.kind === "commit" &&
    ((sideB.kind === "commit" && sideB.hash === sideA.hash) ||
      (sideB.kind === "workdir" && head === sideA.hash && !treeDirty)));
if (sameTree) {
  console.error("a and b are the same tree: nothing to compare. Pass a different ref.");
  process.exit(1);
}

console.log(`\ncomparing\n  A: ${describe(sideA, root)}\n  B: ${describe(sideB, root)}\n`);

const temps: string[] = [];
let pkgA: string, pkgB: string;
try {
  console.log(`building A: mini CI (copy without vendor, bun install, bun run build) …`);
  pkgA = await prepareSide(sideA, root, temps);
  console.log(`\nbuilding B: mini CI …`);
  pkgB = await prepareSide(sideB, root, temps);
} catch (e) {
  console.error(
    `\nbuild failed; the temp dirs are kept for inspection:\n  ${temps.join("\n  ")}\n`,
  );
  console.error(String(e));
  process.exit(1);
}

try {
  await abMain(pkgA, pkgB, opts.control, opts.runs, opts.calibrate, opts.save);
} finally {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
}
