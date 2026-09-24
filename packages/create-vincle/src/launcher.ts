#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const binPath = fileURLToPath(new URL("./bin.js", import.meta.url));
const globals = globalThis as unknown as {
  Deno?: {
    exit?: (code: number) => void;
  };
  process?: {
    argv?: string[];
    execPath?: string;
    exitCode?: number;
    env?: Record<string, string | undefined>;
  };
};

if (globals.Deno) {
  await import("./bin.js");
} else {
  const execPath = globals.process?.env?.["npm_execpath"];
  const execName = execPath ? basename(execPath).toLowerCase() : "";
  const userAgent = globals.process?.env?.["npm_config_user_agent"] ?? "";
  let command = globals.process?.execPath ?? "node";
  if (execName.startsWith("bun") || userAgent.startsWith("bun/")) {
    command = execPath ?? "bun";
  } else if (
    execName.startsWith("deno") ||
    (globals.process?.env?.["DENO_VERSION"] && !userAgent.startsWith("npm/"))
  ) {
    command = execPath ?? "deno";
  }

  const args = globals.process?.argv?.slice(2) ?? [];
  const result = spawnSync(command, [binPath, ...args], { stdio: "inherit" });

  if (result.error) {
    console.error(`Unable to start ${command}: ${result.error.message}`);
    if (globals.process) globals.process.exitCode = 1;
  } else if (result.status !== 0) {
    if (globals.process) globals.process.exitCode = result.status ?? 1;
  }
}
