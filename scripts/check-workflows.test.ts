import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { commandPlan, dispatchMatrix, expandCommand } from "./check-workflows.js";

test("workflow filters resolve to real packages, including the historical double-prefix regression", () => {
  expect(() => commandPlan('bun run --filter="@vincle/vincle/flow" mutation')).toThrow(
    "unknown package",
  );
  expect(commandPlan('bun run --filter="@vincle/flow" mutation')?.args).toContain(
    "--filter=@vincle/flow",
  );
});

test("command expansion retains the workflow's Turbo flags", () => {
  const command = expandCommand(
    'bun x turbo run mutation --filter="$PACKAGE" --output-logs=stream',
    {
      PACKAGE: "@vincle/flow",
    },
  );
  expect(commandPlan(command)?.args).toContain("--output-logs=stream");
  const result = Bun.spawnSync(
    [
      resolve(import.meta.dir, "../node_modules/.bin/turbo"),
      ...commandPlan(command)!.args,
      "--dry=json",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  expect(result.exitCode).not.toBe(0);
});

test("unknown expressions cannot silently skip a command check", () => {
  expect(() =>
    expandCommand('bun x turbo run mutation --filter="${{ matrix.unknown }}"', {}),
  ).toThrow();
});

test("dispatch matrix evaluates all and individual choices without changing package names", () => {
  const expression =
    "${{ fromJSON(inputs.package == 'all' && '[\"@vincle/core\",\"@vincle/flow\"]' || format('[\"{0}\"]', inputs.package)) }}";
  const options = ["all", "@vincle/core", "@vincle/flow"];
  expect(dispatchMatrix(expression, options)).toEqual(options.slice(1));
  expect(() => dispatchMatrix(expression.replace("{0}", "@vincle/{0}"), options)).toThrow(
    "changes the selected package",
  );
  expect(() => dispatchMatrix(expression, [...options, "@vincle/precompile"])).toThrow(
    "every package choice",
  );
});

test("a failed fuzz job reaches triage with the same seed and a usable reproduction command", async () => {
  const workflow = Bun.YAML.parse(
    readFileSync(resolve(import.meta.dir, "../.github/workflows/nightly-checks.yml"), "utf8"),
  ) as any;
  const fuzz = workflow.jobs.fuzz;
  const triage = workflow.jobs["_triage"];
  const run = fuzz.steps.find((step: any) => step.id === "fuzz");
  expect(run["continue-on-error"]).not.toBe(true);
  expect(fuzz["continue-on-error"]).not.toBe(true);
  expect(workflow.env.VINCLE_FUZZ_SEEDS).toBe("${{ github.run_id }}");
  expect(triage.needs).toContain("fuzz");
  expect(triage.if).toBe("always()");
  expect(fuzz.steps.find((step: any) => step.uses?.startsWith("actions/upload-artifact")).if).toBe(
    "always()",
  );
  const notification = triage.steps.find((step: any) => step.name.startsWith("Fuzz —"));
  expect(notification.if).toBe("needs.fuzz.result == 'failure'");
  const created: any[] = [];
  const github = {
    rest: {
      issues: {
        listForRepo: async () => ({ data: [] }),
        create: async (issue: any) => created.push(issue),
      },
    },
  };
  const context = {
    repo: { owner: "fixture", repo: "fixture" },
    runId: 12345,
    runNumber: 7,
    eventName: "schedule",
  };
  const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
    "github",
    "context",
    "process",
    notification.with.script,
  );
  await execute(github, context, { env: { VINCLE_FUZZ_SEEDS: String(context.runId) } });
  expect(created).toHaveLength(1);
  expect(created[0].title).toContain("12345");
  expect(created[0].body).toContain(
    "VINCLE_FUZZ_SEEDS=12345 bun run --filter=@vincle/core mutation:fuzz",
  );
});
