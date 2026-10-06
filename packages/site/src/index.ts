import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type SiteContent = string | Uint8Array | ArrayBuffer;
export interface SiteOutput {
  /** Relative file path, such as cv/index.html; distinct from its public URL. */
  path: string;
  content: SiteContent | (() => SiteContent | Promise<SiteContent>);
}
export interface SiteOptions {
  /** Dedicated output directory owned by this build, except preserved entries. */
  out: string;
  outputs: Iterable<SiteOutput> | AsyncIterable<SiteOutput>;
  copy?: readonly { from: string; to?: string }[];
  /** Top-level files or directories owned by another tool, such as assets. */
  preserve?: readonly string[];
}

export const ERR_SITE_BUILD = "ERR_VINCLE_SITE_BUILD";
function failure(message: string, cause?: unknown): Error {
  const error = new Error(`[vincle/site] ${message}`, { cause });
  return Object.assign(error, { code: ERR_SITE_BUILD });
}

function filePath(value: string): string {
  if (
    !value ||
    value.includes("\\") ||
    value.includes("\0") ||
    path.isAbsolute(value) ||
    /^[a-z]:/i.test(value)
  )
    throw failure(`Invalid relative output path: ${JSON.stringify(value)}`);
  if (value.split("/").some((part) => !part || part === "." || part === ".."))
    throw failure(`Invalid relative output path: ${JSON.stringify(value)}`);
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
      throw failure(`Output location is not a real directory: ${current}`);
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
  const out = path.resolve(options.out);
  if (out === path.parse(out).root || out === process.cwd())
    throw failure(`Use a dedicated output directory: ${out}`);
  await safeDirectory(out);
  const preserve = new Set((options.preserve ?? []).map(filePath));
  if ([...preserve].some((entry) => entry.includes("/")))
    throw failure("Preserved entries must be top-level names");
  await mkdir(path.dirname(out), { recursive: true });
  const stage = await mkdtemp(path.join(path.dirname(out), ".vincle-site-"));
  const files = new Set<string>();
  async function write(name: string, content: SiteContent): Promise<void> {
    filePath(name);
    if (preserve.has(name.split("/")[0]!))
      throw failure(`Output conflicts with preserved entry: ${name}`);
    if (
      [...files].some(
        (other) => other === name || other.startsWith(name + "/") || name.startsWith(other + "/"),
      )
    )
      throw failure(`Output collision: ${name}`);
    files.add(name);
    const target = path.join(stage, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content instanceof ArrayBuffer ? new Uint8Array(content) : content);
  }
  async function copy(from: string, prefix: string): Promise<void> {
    const info = await lstat(from);
    if (info.isSymbolicLink()) throw failure(`Cannot copy symbolic link: ${from}`);
    if (info.isDirectory()) {
      for (const entry of await readdir(from))
        await copy(path.join(from, entry), prefix ? `${prefix}/${entry}` : entry);
    } else if (info.isFile()) {
      await write(prefix, await readFile(from));
    } else throw failure(`Cannot copy special file: ${from}`);
  }
  try {
    for (const resource of options.copy ?? []) {
      if (resource.to !== undefined) filePath(resource.to);
      await copy(path.resolve(resource.from), resource.to ?? "");
    }
    for await (const output of options.outputs) {
      filePath(output.path);
      try {
        await write(
          output.path,
          typeof output.content === "function" ? await output.content() : output.content,
        );
      } catch (error) {
        throw failure(
          `Failed to generate ${output.path}: ${error instanceof Error ? error.message : String(error)}`,
          error,
        );
      }
    }
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
