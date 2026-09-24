import { spawn } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import type { Runtime } from "./runtime";

import { createError, ERR_CREATE_INSTALL, ERR_CREATE_PROJECT } from "./errors";
import { getHost } from "./host";
import { buildProjectFiles } from "./templates";

export interface CreateProjectOptions {
  target: string;
  runtime: Runtime;
  cwd?: string;
  force?: boolean;
  install?: boolean;
  name?: string;
  installDependencies?: (runtime: Runtime, cwd: string) => Promise<void>;
}

export interface ProjectResult {
  target: string;
  packageName: string;
  runtime: Runtime;
  files: string[];
}

export function normalizePackageName(value: string): string {
  let name = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-+/g, "-");
  if (!name) name = "vincle-app";
  if (/^\d/.test(name)) name = `vincle-${name}`;
  return name.slice(0, 214);
}

function isMissingPath(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function projectError(message: string): Error & { code: typeof ERR_CREATE_PROJECT } {
  return createError(message, ERR_CREATE_PROJECT);
}

async function ensureTarget(target: string, force: boolean): Promise<boolean> {
  try {
    const info = await stat(target);
    if (!info.isDirectory()) {
      throw projectError(`Target exists and is not a directory: ${target}`);
    }
    const entries = await readdir(target);
    if (entries.length > 0 && !force) {
      throw projectError(`Target directory is not empty: ${target}`);
    }
    return false;
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    await mkdir(target, { recursive: true });
    return true;
  }
}

function installError(message: string): Error & { code: typeof ERR_CREATE_INSTALL } {
  return createError(message, ERR_CREATE_INSTALL);
}

export function installProject(runtime: Runtime, cwd: string): Promise<void> {
  const globals = globalThis as unknown as { process?: { platform?: string } };
  const baseCommand = runtime === "bun" ? "bun" : runtime === "deno" ? "deno" : "npm";
  const windows = globals.process?.platform === "win32";
  const command = baseCommand === "npm" && windows ? "npm.cmd" : baseCommand;
  const args = runtime === "deno" ? ["cache", "server.tsx"] : ["install"];

  return new Promise((resolveInstall, rejectInstall) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: windows && baseCommand === "npm",
    });

    child.once("error", (error) => {
      rejectInstall(installError(`Unable to start ${command}: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveInstall();
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      rejectInstall(installError(`${command} dependency setup failed with ${reason}`));
    });
  });
}

export async function createProject(options: CreateProjectOptions): Promise<ProjectResult> {
  const cwd = options.cwd ?? getHost().cwd;
  const target = resolve(cwd, options.target);
  const packageName = normalizePackageName(options.name ?? basename(target));
  const files = buildProjectFiles(options.runtime, packageName);
  const created = await ensureTarget(target, options.force === true);

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = resolve(target, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, {
        encoding: "utf8",
        flag: options.force ? "w" : "wx",
      });
    }
  } catch (error) {
    if (created) await rm(target, { recursive: true, force: true });
    throw error;
  }

  if (options.install !== false) {
    const install = options.installDependencies ?? installProject;
    await install(options.runtime, target);
  }

  return {
    target,
    packageName,
    runtime: options.runtime,
    files: Object.keys(files),
  };
}
