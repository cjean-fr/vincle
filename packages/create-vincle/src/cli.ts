import { relative } from "node:path";

import { ERR_CREATE_CLI } from "./errors";
import { getHost } from "./host";
import { createProject, installProject, type ProjectResult } from "./project";
import {
  detectRuntime,
  parseRuntime,
  promptRuntime,
  runtimeDevCommand,
  runtimeLabel,
  type Ask,
  type Runtime,
} from "./runtime";

const VERSION = "0.9.0";

export interface ParsedArgs {
  target?: string;
  runtime?: Runtime | "auto";
  name?: string;
  yes: boolean;
  install: boolean;
  force: boolean;
  help: boolean;
  version: boolean;
}

export interface CliContext {
  cwd?: string;
  detectedRuntime?: Runtime;
  interactive?: boolean;
  ask?: Ask;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  installDependencies?: (runtime: Runtime, cwd: string) => Promise<void>;
}

export class CliError extends Error {
  readonly code = ERR_CREATE_CLI;

  constructor(message: string) {
    super(`[vincle/create-vincle] ${message}`);
  }
}

function cliError(message: string): CliError {
  return new CliError(message);
}

function valueFor(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw cliError(`${option} requires a value`);
  }
  return value;
}

function parseRuntimeValue(value: string): Runtime | "auto" {
  if (value.toLowerCase() === "auto") return "auto";
  const runtime = parseRuntime(value);
  if (!runtime) throw cliError(`Unknown runtime: ${value}`);
  return runtime;
}

export function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    yes: false,
    install: true,
    force: false,
    help: false,
    version: false,
  };
  let positionalOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;

    if (!positionalOnly && argument === "--") {
      positionalOnly = true;
      continue;
    }

    if (!positionalOnly && argument.startsWith("-")) {
      if (argument === "--help" || argument === "-h") {
        parsed.help = true;
        continue;
      }
      if (argument === "--version" || argument === "-v") {
        parsed.version = true;
        continue;
      }
      if (argument === "--yes" || argument === "-y") {
        parsed.yes = true;
        continue;
      }
      if (argument === "--no-install") {
        parsed.install = false;
        continue;
      }
      if (argument === "--install") {
        parsed.install = true;
        continue;
      }
      if (argument === "--force") {
        parsed.force = true;
        continue;
      }
      if (argument === "--runtime") {
        parsed.runtime = parseRuntimeValue(valueFor(args, index, argument));
        index += 1;
        continue;
      }
      if (argument.startsWith("--runtime=")) {
        parsed.runtime = parseRuntimeValue(argument.slice("--runtime=".length));
        continue;
      }
      if (argument === "--name") {
        parsed.name = valueFor(args, index, argument);
        index += 1;
        continue;
      }
      if (argument.startsWith("--name=")) {
        parsed.name = argument.slice("--name=".length);
        continue;
      }
      throw cliError(`Unknown option: ${argument}`);
    }

    if (parsed.target) {
      throw cliError(`Unexpected argument: ${argument}`);
    }
    parsed.target = argument;
  }

  return parsed;
}

export function helpText(): string {
  return `create-vincle

Create a Vincle server project.

Usage:
  npm create vincle [directory]
  bun create vincle [directory]
  deno run -A npm:create-vincle [directory]

Options:
  --runtime <auto|bun|deno|node>  Choose the target runtime
  --name <name>                   Set the generated package name
  --yes, -y                        Accept the detected runtime
  --no-install                     Do not install or cache dependencies
  --force                          Allow a non-empty target directory
  --help, -h                       Show this help
  --version, -v                    Show the version
`;
}

async function chooseRuntime(
  detectedRuntime: Runtime | undefined,
  override: Runtime | "auto" | undefined,
  interactive: boolean,
  ask: Ask,
  onError: (message: string) => void,
): Promise<Runtime> {
  if (override && override !== "auto") return override;
  if (!interactive) {
    if (!detectedRuntime) {
      throw cliError("Unable to detect a runtime; pass --runtime bun, deno, or node.");
    }
    return detectedRuntime;
  }
  return promptRuntime(detectedRuntime, ask, onError);
}

function resultMessage(
  result: ProjectResult,
  targetArgument: string,
  cwd: string,
  install: boolean,
  runtime: Runtime,
): string {
  const relativeLocation = relative(cwd, result.target) || ".";
  const location = relativeLocation.startsWith("..") ? result.target : relativeLocation;
  const installHint = install
    ? `  ${runtimeDevCommand(runtime)}\n`
    : `  ${runtime === "deno" ? "deno cache server.tsx" : `${runtime === "bun" ? "bun" : "npm"} install`}\n  ${runtimeDevCommand(runtime)}\n`;
  return `Created ${result.packageName} in ${location}\nRuntime: ${runtimeLabel(runtime)}\n\nNext steps:\n  cd ${targetArgument}\n${installHint}`;
}

export async function runCli(
  args: string[],
  context: CliContext = {},
): Promise<ProjectResult | undefined> {
  const host = getHost();
  const stdout = context.stdout ?? host.stdout;
  const stderr = context.stderr ?? host.stderr;
  const parsed = parseArgs(args);

  if (parsed.help) {
    stdout(helpText());
    return undefined;
  }
  if (parsed.version) {
    stdout(`${VERSION}\n`);
    return undefined;
  }

  const detectedRuntime = context.detectedRuntime ?? detectRuntime();
  const runtime = await chooseRuntime(
    detectedRuntime,
    parsed.runtime,
    (context.interactive ?? host.isInteractive()) && !parsed.yes,
    context.ask ?? host.ask,
    stderr,
  );
  const targetArgument = parsed.target ?? "vincle-app";
  const result = await createProject({
    target: targetArgument,
    runtime,
    cwd: context.cwd ?? host.cwd,
    force: parsed.force,
    install: parsed.install,
    name: parsed.name,
    installDependencies: context.installDependencies ?? installProject,
  });

  stdout(resultMessage(result, targetArgument, context.cwd ?? host.cwd, parsed.install, runtime));
  return result;
}

export async function main(
  args: string[] = getHost().args,
  context: CliContext = {},
): Promise<number> {
  const host = getHost();
  const stderr = context.stderr ?? host.stderr;
  try {
    await runCli(args, context);
    return 0;
  } catch (error) {
    stderr(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
