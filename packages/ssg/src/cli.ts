import { access } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfigFromFile, mergeConfig } from "vite";

import type { SsgConfig, SsgConfigEnv } from "./config.js";

import { build, buildSummary } from "./build.js";
import { dev } from "./dev.js";
import { diagnose, failure } from "./errors.js";

const invalidCommand = (message: string) =>
  failure(message, {
    reason: "INVALID_CONFIG",
    hint: "Run ssg --help for supported commands and options.",
    context: { phase: "cli" },
  });

const help = `Usage: ssg <dev|generate> [options]

  --config <file>  Use a specific SSG configuration
  --root <path>    Project directory (default: current directory)
  --mode <name>    Configuration mode (default: development or production)
  --port <number> Development server port
  --host <host>   Development server address
  --help          Show this help

Automatically loads ssg.config.ts (also .mts, .js, .mjs, .cts and .cjs).
"ssg build" is deprecated: use "ssg generate".
`;

/** Parse and validate command-line inputs before loading project configuration. */
function cliArguments(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    allowNegative: true,
    options: {
      config: { type: "string" },
      root: { type: "string" },
      mode: { type: "string" },
      port: { type: "string" },
      host: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || !positionals.length) {
    console.log(help);
    return;
  }
  const requested = positionals[0];
  if (
    positionals.length !== 1 ||
    (requested !== "dev" && requested !== "generate" && requested !== "build")
  )
    throw invalidCommand("Expected ssg dev or ssg generate. Run ssg --help.");
  if (requested === "build")
    console.warn('Warning: "ssg build" is deprecated and will be removed. Use "ssg generate".');
  const command = requested === "dev" ? "dev" : "generate";
  if (command === "generate" && (values.port !== undefined || values.host !== undefined))
    throw invalidCommand("--port and --host apply only to ssg dev.");
  const port = values.port === undefined ? undefined : Number(values.port);
  if (
    port !== undefined &&
    (!/^\d+$/.test(values.port!) || !Number.isInteger(port) || port < 0 || port > 65535)
  )
    throw invalidCommand("--port must be an integer between 0 and 65535.");
  return { values, command, port };
}

export async function runCli(args: string[]): Promise<void> {
  const parsed = cliArguments(args);
  if (!parsed) return;
  const { values, command, port } = parsed;
  const root = path.resolve(values.root ?? process.cwd());
  const config = await loadSsgConfig(
    root,
    {
      command: command === "dev" ? "serve" : "build",
      mode: values.mode ?? (command === "dev" ? "development" : "production"),
    },
    values.config,
  );
  const { dev: development, ...shared } = config;
  const projectRoot = values.root ? root : path.resolve(root, shared.root ?? ".");
  process.chdir(projectRoot);
  if (command === "generate") {
    const started = performance.now();
    const { files } = await build({ ...shared, root: projectRoot });
    console.log(buildSummary(files, performance.now() - started));
    return;
  }
  const serverPromise = dev({
    ...shared,
    ...development,
    root: projectRoot,
    vite: mergeConfig(development?.vite ?? {}, {
      mode: values.mode ?? "development",
      server: {
        ...(port === undefined ? {} : { port }),
        ...(values.host === undefined ? {} : { host: values.host }),
      },
    }),
  });
  await serveCli(serverPromise);
}

/** Keep startup and signal-driven shutdown in one lifecycle. */
async function serveCli(serverPromise: ReturnType<typeof dev>): Promise<void> {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    // Vite can complete its signal handler first; normal shutdown is successful.
    process.exitCode = 0;
    try {
      await (await serverPromise).close();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    const server = await serverPromise;
    if (!stopping) server.vite.printUrls();
  } catch (error) {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    throw error;
  }
}

const names = [
  "ssg.config.ts",
  "ssg.config.mts",
  "ssg.config.js",
  "ssg.config.mjs",
  "ssg.config.cts",
  "ssg.config.cjs",
];

export async function loadSsgConfig(
  root: string,
  env: SsgConfigEnv,
  explicit?: string,
): Promise<SsgConfig> {
  return diagnose(
    async () => {
      let file: string | undefined;
      for (const name of explicit ? [explicit] : names) {
        const candidate = path.resolve(root, name);
        try {
          await access(candidate);
          file = candidate;
          break;
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
          throw error;
        }
      }
      if (!file) {
        if (!explicit) return {};
        throw failure("The specified SSG configuration does not exist", {
          reason: "INVALID_CONFIG",
          hint: "Check --config or create an ssg.config.ts file.",
          context: { file: path.resolve(root, explicit) },
        });
      }
      const loaded = await loadConfigFromFile(env, file, root, "silent");
      if (!loaded)
        throw failure("The SSG configuration could not be loaded", {
          reason: "INVALID_CONFIG",
          hint: "Check the configuration file and its default export.",
          context: { file },
        });
      return loaded.config as SsgConfig;
    },
    "Could not load SSG configuration",
    {
      reason: "INVALID_CONFIG",
      hint: "Export a configuration object or a function using defineConfig from @vincle/ssg.",
      context: { root, phase: "config" },
    },
  );
}
