import { copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { failure, contextualError } from "./errors.js";

export type SiteContent = string | Uint8Array | ArrayBuffer;
export interface SiteOutput {
  /** Relative file path, such as cv/index.html; distinct from its public URL. */
  path: string;
  content: SiteContent | (() => SiteContent | Promise<SiteContent>);
}
export interface PreparedSite {
  out: string;
  readonly files: readonly string[];
  read(path: string): Promise<Uint8Array>;
  emit(output: SiteOutput): Promise<void>;
}

export interface SiteOptions {
  /** Dedicated output directory owned by this build, except preserved entries. */
  out: string;
  outputs: Iterable<SiteOutput> | AsyncIterable<SiteOutput>;
  copy?: readonly { from: string; to?: string }[];
  /** Top-level files or directories owned by another tool, such as assets. */
  preserve?: readonly string[];
  /** Runs after preparation, before replacing published files. */
  beforePublish?(site: PreparedSite): void | Promise<void>;
}

function filePath(value: string): string {
  if (
    !value ||
    value.includes("\\") ||
    value.includes("\0") ||
    path.isAbsolute(value) ||
    /^[a-z]:/i.test(value)
  )
    throw failure(`Invalid relative output path: ${JSON.stringify(value)}`, {
      reason: "INVALID_OUTPUT_PATH",
      hint: "Use a non-empty path relative to out, with forward slashes and no empty, . or .. segments.",
      context: { path: value },
    });
  if (value.split("/").some((part) => !part || part === "." || part === ".."))
    throw failure(`Invalid relative output path: ${JSON.stringify(value)}`, {
      reason: "INVALID_OUTPUT_PATH",
      hint: "Use a non-empty path relative to out, with forward slashes and no empty, . or .. segments.",
      context: { path: value },
    });
  return value;
}

async function stat(file: string) {
  try {
    return await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Reject symbolic links in the output location, including its ancestors. */
async function safeDirectory(dir: string): Promise<void> {
  let current = path.parse(dir).root;
  for (const part of dir.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await stat(current);
    if (info && (!info.isDirectory() || info.isSymbolicLink()))
      throw failure(`Output location is not a real directory: ${current}`, {
        reason: "INVALID_CONFIG",
        hint: "Choose an output directory whose existing ancestors are real directories, not files or symbolic links.",
        context: { path: current, out: dir },
      });
  }
}

/**
 * Prepare a complete site before replacing generated files. Producers run in
 * order, so later outputs may derive from earlier render results. Preserve is
 * top-level only: all other existing output entries belong to this build.
 * Production/validation failures leave the previous site intact. Publication
 * uses filesystem moves and is not atomic; concurrent builds to one out are
 * unsupported.
 */
export async function generateSite(options: SiteOptions): Promise<{ files: string[] }> {
  const state: { phase: "prepare" | "publish" } = { phase: "prepare" };
  try {
    return await generateSiteInternal(options, () => {
      state.phase = "publish";
    });
  } catch (error) {
    const phase = state.phase;
    throw contextualError(
      error,
      `Could not ${phase === "publish" ? "publish" : "prepare"} site outputs`,
      {
        reason: phase === "publish" ? "PUBLICATION_FAILED" : "PREPARATION_FAILED",
        hint:
          phase === "publish"
            ? "Check output-directory permissions and available disk space, then rebuild. Publication may be incomplete."
            : "Check input/output paths, filesystem permissions and available disk space, then retry. Publication has not started.",
        context: { out: options.out, phase },
      },
    );
  }
}

async function generateSiteInternal(
  options: SiteOptions,
  publishing: () => void,
): Promise<{ files: string[] }> {
  const out = path.resolve(options.out);
  if (out === path.parse(out).root || out === process.cwd())
    throw failure(`Use a dedicated output directory: ${out}`, {
      reason: "INVALID_CONFIG",
      hint: "Set out to a dedicated generated directory such as dist, not the filesystem root or current working directory.",
      context: { out },
    });
  await safeDirectory(out);
  const preserve = new Set((options.preserve ?? []).map(filePath));
  if ([...preserve].some((entry) => entry.includes("/")))
    throw failure("Preserved entries must be top-level names", {
      reason: "INVALID_CONFIG",
      hint: "List top-level names such as assets in preserve; nested paths such as assets/js are not supported.",
      context: { out },
    });
  await mkdir(path.dirname(out), { recursive: true });
  const stage = await mkdtemp(path.join(path.dirname(out), ".vincle-site-"));
  const files = new Set<string>();
  const directories = new Set<string>();
  async function prepareTarget(name: string): Promise<string> {
    filePath(name);
    if (preserve.has(name.split("/")[0]!))
      throw failure(`Output conflicts with preserved entry: ${name}`, {
        reason: "OUTPUT_COLLISION",
        hint: "Remove this name from preserve or change the producer/copy destination so generated files do not overlap preserved entries.",
        context: { path: name, out },
      });
    if (files.has(name) || directories.has(name))
      throw failure(`Output collision: ${name}`, {
        reason: "OUTPUT_COLLISION",
        hint: "Give each generated or copied file a unique destination; a file cannot also be a directory containing other outputs.",
        context: { path: name, out },
      });
    const parents: string[] = [];
    for (
      let parent = path.posix.dirname(name);
      parent !== ".";
      parent = path.posix.dirname(parent)
    ) {
      if (files.has(parent))
        throw failure(`Output collision: ${name}`, {
          reason: "OUTPUT_COLLISION",
          hint: "Give each generated or copied file a unique destination; a file cannot also be a directory containing other outputs.",
          context: { path: name, out },
        });
      parents.push(parent);
    }
    files.add(name);
    for (const parent of parents) directories.add(parent);
    const target = path.join(stage, name);
    await mkdir(path.dirname(target), { recursive: true });
    return target;
  }
  async function write(name: string, content: SiteContent): Promise<void> {
    const target = await prepareTarget(name);
    await writeFile(target, content instanceof ArrayBuffer ? new Uint8Array(content) : content);
  }
  async function copy(from: string, prefix: string): Promise<void> {
    const info = await lstat(from);
    if (info.isSymbolicLink())
      throw failure(`Cannot copy symbolic link: ${from}`, {
        reason: "COPY_FAILED",
        hint: "Copy the real file or directory, or remove this symbolic link from the copied source tree.",
        context: { from, out },
      });
    if (info.isDirectory()) {
      for (const entry of await readdir(from))
        await copy(path.join(from, entry), prefix ? `${prefix}/${entry}` : entry);
    } else if (info.isFile()) {
      await copyFile(from, await prepareTarget(prefix));
    } else
      throw failure(`Cannot copy special file: ${from}`, {
        reason: "COPY_FAILED",
        hint: "Only regular files and directories can be copied. Remove devices, sockets and other special files from the source tree.",
        context: { from, out },
      });
  }
  try {
    for (const resource of options.copy ?? []) {
      if (resource.to !== undefined) filePath(resource.to);
      try {
        await copy(path.resolve(resource.from), resource.to ?? "");
      } catch (error) {
        throw contextualError(error, "Could not copy resource", {
          reason: "COPY_FAILED",
          hint: "Check that the copy source exists and is readable, and its destination does not conflict with another output.",
          context: { from: resource.from, to: resource.to ?? "", out },
        });
      }
    }
    for await (const output of options.outputs) {
      filePath(output.path);
      try {
        await write(
          output.path,
          typeof output.content === "function" ? await output.content() : output.content,
        );
      } catch (error) {
        throw contextualError(error, `Failed to generate ${output.path}`, {
          reason: "OUTPUT_FAILED",
          hint: "Fix the output producer and ensure content is a string, Uint8Array or ArrayBuffer. Check the cause for the original failure.",
          context: { path: output.path, out },
        });
      }
    }
    await options.beforePublish?.({
      out,
      get files() {
        return [...files].toSorted();
      },
      async read(name) {
        filePath(name);
        if (!files.has(name))
          throw failure(`Prepared output does not exist: ${name}`, {
            reason: "INVALID_OUTPUT",
            hint: "Read a path listed in the prepared site's files.",
            context: { path: name, out },
          });
        return await import("node:fs/promises").then((fs) => fs.readFile(path.join(stage, name)));
      },
      async emit(output) {
        await write(
          output.path,
          typeof output.content === "function" ? await output.content() : output.content,
        );
      },
    });
    publishing();
    // Preparation is beside out so publication uses same-filesystem moves.
    await safeDirectory(out);
    await mkdir(out, { recursive: true });
    for (const entry of await readdir(out))
      if (!preserve.has(entry)) await rm(path.join(out, entry), { recursive: true, force: true });
    for (const entry of await readdir(stage))
      await rename(path.join(stage, entry), path.join(out, entry));
    return { files: [...files].toSorted() };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
