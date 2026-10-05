import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const rootManifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const packages = new Map<string, { scripts: Record<string, string> }>();
for (const group of ["packages", "apps"]) {
  for (const entry of readdirSync(join(ROOT, group))) {
    const file = Bun.file(join(ROOT, group, entry, "package.json"));
    if (await file.exists()) {
      const manifest = await file.json();
      packages.set(manifest.name, manifest);
    }
  }
}

/** Expand only fixture values; never evaluate workflow shell or publish commands. */
export function expandCommand(command: string, values: Record<string, string>): string {
  return command.replace(
    /\$\{\{\s*(.*?)\s*\}\}|\$\{([A-Z_]+)\}|\$([A-Z_]+)/g,
    (_, expression: string, braced: string, variable: string) => {
      const key = expression ?? braced ?? variable;
      if (!(key in values)) throw new Error(`Missing command fixture: ${key}`);
      return values[key]!;
    },
  );
}

export function commandPlan(command: string): { task: string; args: string[] } | undefined {
  const words =
    command.match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map((word) => word.replace(/["']/g, "")) ?? [];
  if (words[0] !== "bun") return;
  let args: string[];
  if (words[1] === "x" && words[2] === "turbo") args = words.slice(3);
  else if (words[1] === "run" && words[2]?.startsWith("--filter=")) {
    const filter = words[2].slice("--filter=".length);
    const manifest = packages.get(filter);
    if (!manifest) throw new Error(`Workflow selects unknown package: ${filter}`);
    const task = words[3]!;
    if (!(task in manifest.scripts)) throw new Error(`${filter} has no script ${task}`);
    // Mutation must build declared prerequisites through Turbo, not just run Stryker.
    if (task !== "mutation") return;
    args = ["run", task, words[2], ...words.slice(4)];
  } else if (words[1] === "run") {
    const task = words[2]!;
    if (task.includes("/")) return;
    const script = rootManifest.scripts[task];
    if (!script) throw new Error(`Workflow selects unknown root script: ${task}`);
    if (!script.startsWith("turbo ")) return;
    args = [...script.split(/\s+/).slice(1), ...words.slice(3)];
    if (/[;&|]/.test(script)) return;
  } else return;
  const task = args[0] === "run" ? args[1] : args[0];
  if (!task || task.startsWith("-")) throw new Error(`Missing Turbo task: ${command}`);
  return { task, args };
}

export function dispatchMatrix(expression: string, options: string[]): string[] {
  // Evaluate this workflow's constrained fromJSON/format matrix without running
  // arbitrary expressions. An unfamiliar expression requires an explicit fixture.
  const match = expression.match(
    /^\$\{\{\s*fromJSON\(inputs\.package == 'all' && '([^']+)' \|\| format\('([^']+)', inputs\.package\)\)\s*\}\}$/,
  );
  if (!match) throw new Error("Unsupported dispatch matrix expression");
  const all = JSON.parse(match[1]!) as string[];
  const expected = options.filter((value) => value !== "all");
  if (JSON.stringify(all.toSorted()) !== JSON.stringify(expected.toSorted())) {
    throw new Error("The all mutation matrix must include every package choice");
  }
  for (const value of expected) {
    const selection = JSON.parse(match[2]!.replaceAll("{0}", value));
    if (JSON.stringify(selection) !== JSON.stringify([value])) {
      throw new Error(`Mutation matrix changes the selected package: ${value}`);
    }
  }
  return all;
}

async function dryRun(command: string) {
  const plan = commandPlan(command);
  if (!plan) return;
  const result = Bun.spawnSync(
    [join(ROOT, "node_modules/.bin/turbo"), ...plan.args, "--dry=json"],
    {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (result.exitCode !== 0) throw new Error(`${command}\n${result.stderr.toString()}`);
  const output = JSON.parse(result.stdout.toString());
  const selected = plan.args
    .filter((arg) => arg.startsWith("--filter="))
    .map((arg) => arg.slice(9));
  const expected = selected.length
    ? selected
    : [...packages.keys()].filter((name) => plan.task in packages.get(name)!.scripts);
  for (const name of expected) {
    if (!packages.has(name)) throw new Error(`Workflow selects unknown package: ${name}`);
    if (
      !output.tasks.some(
        (task: { taskId: string; command?: string }) =>
          task.taskId === `${name}#${plan.task}` &&
          task.command &&
          task.command !== "<NONEXISTENT>",
      )
    ) {
      throw new Error(`Dry run did not select executable ${name}#${plan.task}: ${command}`);
    }
  }
}

if (import.meta.main) {
  const checked = new Set<string>();
  for (const name of readdirSync(join(ROOT, ".github/workflows"))) {
    if (!/\.ya?ml$/.test(name)) continue;
    const workflow = Bun.YAML.parse(
      readFileSync(join(ROOT, ".github/workflows", name), "utf8"),
    ) as any;
    for (const job of Object.values(workflow.jobs) as any[]) {
      const matrix = job.strategy?.matrix;
      let rows: Record<string, string>[] = [{}];
      if (matrix?.include) rows = matrix.include;
      else if (matrix) {
        for (const [key, rawValues] of Object.entries(matrix)) {
          // The manual mutation matrix is derived from its constrained dispatch input.
          const options = workflow.on?.workflow_dispatch?.inputs?.[key]?.options;
          const values = Array.isArray(rawValues)
            ? rawValues
            : typeof rawValues === "string" && options
              ? dispatchMatrix(rawValues, options)
              : undefined;
          if (!values) throw new Error(`${name}: unsupported matrix fixture ${key}`);
          rows = rows.flatMap((row) =>
            values.map((value: string) => Object.assign({}, row, { [key]: value })),
          );
        }
      }
      const releaseOptions = workflow.on?.workflow_dispatch?.inputs?.package?.options;
      if (!matrix && releaseOptions)
        rows = releaseOptions.map((value: string) => ({ releasePackage: value }));
      for (const row of rows) {
        const values: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) values[`matrix.${key}`] = String(value);
        if (row.releasePackage)
          values["steps.meta.outputs.package_name"] = `@vincle/${row.releasePackage}`;
        for (const step of job.steps ?? []) {
          if (!step.run) continue;
          for (const line of step.run.split("\n")) {
            if (!/^\s*bun (?:x turbo|run)\b/.test(line)) continue;
            const env = { ...job.env, ...step.env };
            for (const [key, value] of Object.entries(env)) {
              if (typeof value === "string" && /\$\{\{/.test(value) && !/matrix\./.test(value))
                continue;
              values[key] = expandCommand(String(value), values);
            }
            const command = expandCommand(line.trim(), values);
            if (!checked.has(command)) {
              await dryRun(command);
              checked.add(command);
            }
          }
        }
      }
    }
  }
  console.log(
    `Workflow commands passed (${checked.size} expanded commands; Turbo plans only, no tasks executed).`,
  );
}
