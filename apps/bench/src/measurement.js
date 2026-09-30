import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { cpus, release } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEPENDENCIES = [
  "@kitajs/html",
  "hono",
  "mitata",
  "preact",
  "preact-render-to-string",
  "react",
  "react-dom",
];

function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function fingerprint(root, files) {
  const hash = createHash("sha256");
  for (const path of files.toSorted()) {
    hash.update(relative(root, path)).update("\0").update(readFileSync(path)).update("\0");
  }
  return hash.digest("hex");
}

export function buildIdentity(root) {
  const toolchain = {};
  for (const name of ["tsdown", "typescript"]) {
    const path = join(root, "node_modules", name, "package.json");
    if (existsSync(path)) toolchain[name] = JSON.parse(readFileSync(path, "utf8")).version;
  }
  return {
    version: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
    sha256: fingerprint(
      root,
      filesUnder(join(root, "dist")).filter((p) => p.endsWith(".mjs")),
    ),
    toolchain,
  };
}

// Called after measurement: filesystem reads and imports do not warm the cases.
export function measurementEnvironment(benchUrl) {
  const bench = fileURLToPath(benchUrl);
  const src = dirname(bench);
  const app = dirname(src);
  const dependencies = Object.fromEntries(
    DEPENDENCIES.map((name) => [
      name,
      JSON.parse(readFileSync(join(app, "node_modules", name, "package.json"), "utf8")).version,
    ]),
  );
  return {
    runtime: {
      name: process.versions.bun ? "bun" : "node",
      version: process.versions.bun ?? process.version,
      flags: process.execArgv,
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: release(),
      cpu: cpus()[0]?.model,
      affinity:
        process.platform === "linux"
          ? readFileSync("/proc/self/status", "utf8").match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1]
          : undefined,
    },
    harness: {
      sha256: fingerprint(src, [
        bench,
        ...filesUnder(join(src, "realworld")).filter((p) => /\.(js|mjs)$/.test(p)),
      ]),
      cases: process.env.VINCLE_BENCH_CASES?.split(",").toSorted() ?? "all",
      sampling: "mitata defaults",
      nodeEnv: process.env.NODE_ENV,
      conditions: process.execArgv.filter((arg) => arg.startsWith("--conditions")),
    },
    dependencies,
    core: buildIdentity(realpathSync(join(app, "node_modules/@vincle/core"))),
  };
}

export function repositoryState(cwd) {
  const git = (args, directory = cwd) =>
    execFileSync("git", args, { cwd: directory, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  try {
    const root = git(["rev-parse", "--show-toplevel"]);
    return {
      head: git(["rev-parse", "HEAD"]),
      lockfileSha256: createHash("sha256")
        .update(readFileSync(join(root, "bun.lock")))
        .digest("hex"),
      coreSourceSha256: fingerprint(root, [
        join(root, "packages/core/index.ts"),
        join(root, "packages/core/package.json"),
        join(root, "packages/core/tsdown.config.ts"),
        join(root, "packages/core/tsconfig.json"),
        ...filesUnder(join(root, "packages/core/src")).filter(
          (p) => !p.includes(".test.") && p.endsWith(".ts"),
        ),
      ]),
      coreDirty: git(["status", "--porcelain", "--", "packages/core"], root) !== "",
    };
  } catch {
    return undefined;
  }
}

export const METADATA_PREFIX = "VINCLE_BENCH_METADATA ";
export function readMeasurement(stdout, stderr) {
  const line = stdout.trimEnd().split("\n").at(-1);
  if (!line) throw new Error("benchmark emitted no JSON");
  const metadata = stderr.split("\n").find((s) => s.startsWith(METADATA_PREFIX));
  return {
    rows: JSON.parse(line),
    environment: metadata ? JSON.parse(metadata.slice(METADATA_PREFIX.length)) : undefined,
  };
}

export function environmentDifferences(a, b) {
  if (!a || !b) return [];
  const differences = [];
  for (const field of ["runtime", "host", "dependencies"]) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) differences.push(field);
  }
  for (const field of ["sha256", "cases", "sampling", "nodeEnv", "conditions"]) {
    if (JSON.stringify(a.harness[field]) !== JSON.stringify(b.harness[field]))
      differences.push(`harness.${field}`);
  }
  if (
    Object.keys(a.core?.toolchain ?? {}).length &&
    Object.keys(b.core?.toolchain ?? {}).length &&
    JSON.stringify(a.core.toolchain) !== JSON.stringify(b.core.toolchain)
  )
    differences.push("core.toolchain");
  return differences;
}

export function comparisonDelta(now, before, metric = "ratios") {
  const ratio = metric === "ratios";
  const a = ratio ? now.ratio : now.mean;
  const b = ratio ? before.ratio : before.mean;
  if (a === undefined || b === undefined) return undefined;
  const sdA = ratio ? now.ratioSd : now.sd;
  const sdB = ratio ? before.ratioSd : before.sd;
  if (sdA === undefined || sdB === undefined) return undefined;
  const se = Math.sqrt(sdA ** 2 / now.n + sdB ** 2 / before.n);
  const sigmas = se === 0 ? (a === b ? 0 : Infinity) : Math.abs(a - b) / se;
  return { before: b, after: a, delta: (a / b - 1) * 100, sigmas };
}
