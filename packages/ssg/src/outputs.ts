import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
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
/** Internal, session-owned development snapshot; never shared across output directories. */
export class PublicationCache {
  entries = new Map<string, { digest: string; source?: string }>();
  ready = false;
  clear() {
    this.entries.clear();
    this.ready = false;
  }
}

export async function generateSite(options: SiteOptions): Promise<{ files: string[] }> {
  return publishSite(options);
}

/** Internal development writer; validation and hooks still see the complete site. */
export function generateSiteCached(options: SiteOptions, cache: PublicationCache) {
  return publishSite(options, cache);
}

async function publishSite(
  options: SiteOptions,
  cache?: PublicationCache,
): Promise<{ files: string[] }> {
  const state: { phase: "prepare" | "publish" } = { phase: "prepare" };
  try {
    return await generateSiteInternal(
      options,
      () => {
        state.phase = "publish";
      },
      cache,
    );
  } catch (error) {
    const phase = state.phase;
    if (phase === "publish") cache?.clear();
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
  cache?: PublicationCache,
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
  const next = new Map<string, { digest: string; source?: string }>();
  const changed = new Set<string>();
  const previous = cache?.ready ? cache.entries : undefined;
  function digest(content: SiteContent): string {
    return createHash("sha256")
      .update(content instanceof ArrayBuffer ? new Uint8Array(content) : content)
      .digest("hex");
  }
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
    return path.join(stage, name);
  }
  async function write(name: string, content: SiteContent): Promise<void> {
    const target = await prepareTarget(name);
    const fingerprint = cache ? digest(content) : "";
    if (cache) next.set(name, { digest: fingerprint });
    if (previous?.get(name)?.digest === fingerprint) return;
    changed.add(name);
    await mkdir(path.dirname(target), { recursive: true });
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
      const target = await prepareTarget(prefix);
      const source = JSON.stringify([from, info.size, info.mtimeMs, info.ctimeMs]);
      const old = previous?.get(prefix);
      if (old?.source === source) {
        next.set(prefix, old);
        return;
      }
      let fingerprint = "";
      if (cache) {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(from)) hash.update(chunk);
        fingerprint = hash.digest("hex");
        next.set(prefix, { digest: fingerprint, source });
      }
      if (old?.digest === fingerprint) return;
      changed.add(prefix);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(from, target);
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
        return await readFile(path.join(changed.has(name) ? stage : out, name));
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
    if (!previous) {
      for (const entry of await readdir(out))
        if (!preserve.has(entry)) await rm(path.join(out, entry), { recursive: true, force: true });
      for (const entry of await readdir(stage))
        await rename(path.join(stage, entry), path.join(out, entry));
    } else {
      const obsolete = [...previous.keys()].filter((name) => !files.has(name));
      const oldDirectories = new Set<string>();
      for (const name of obsolete) {
        await safeDirectory(path.dirname(path.join(out, name)));
        await rm(path.join(out, name), { force: true });
        for (
          let parent = path.posix.dirname(name);
          parent !== ".";
          parent = path.posix.dirname(parent)
        )
          oldDirectories.add(parent);
      }
      // Remove only empty owned directories, deepest first, including file/directory transitions.
      for (const dir of [...oldDirectories].toSorted((a, b) => b.length - a.length)) {
        try {
          await rmdir(path.join(out, dir));
        } catch (error) {
          if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? ""))
            throw error;
        }
      }
      for (const name of changed) {
        const target = path.join(out, name);
        await safeDirectory(path.dirname(target));
        const info = await stat(target);
        if (info?.isSymbolicLink() || (info && !info.isFile()))
          throw failure(`Cannot replace non-file output: ${name}`, {
            reason: "INVALID_OUTPUT",
            hint: "Remove the conflicting directory or symbolic link from the generated output directory and rebuild.",
            context: { path: name, out },
          });
        await mkdir(path.dirname(target), { recursive: true });
        await rename(path.join(stage, name), target);
      }
    }
    if (cache) {
      cache.entries = next;
      cache.ready = true;
    }
    return { files: [...files].toSorted() };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
