import { execFile } from "node:child_process";
/** Source links and tracked content revision dates. */
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const APP_ROOT = path.resolve(import.meta.dirname!, "../..");

/** `{editUrl}/{path within the app}`: the base carries host, branch and app dir. */
export function editUrlFor(base: string | null, file: string): string | null {
  if (!base) return null;
  const rel = path.relative(APP_ROOT, file);
  // A page outside the app has no position in the repository.
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `${base.replace(/\/+$/, "")}/${rel.split(path.sep).join("/")}`;
}

/** Last tracked revision of a page or content directory, never the build time. */
export async function lastModified(source: string): Promise<string | null> {
  try {
    const absolute = path.resolve(source);
    const directory = (await stat(absolute)).isDirectory();
    const cwd = directory ? absolute : path.dirname(absolute);
    const { stdout } = await run(
      "git",
      ["log", "-1", "--format=%H %cI", "--", directory ? "." : path.basename(absolute)],
      { cwd },
    );
    const [commit, date] = stdout.trim().split(" ");
    if (!commit || !date || !Number.isFinite(Date.parse(date))) return null;
    const shallow = await run(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-path", "shallow"],
      { cwd },
    );
    const boundaries = await readFile(shallow.stdout.trim(), "utf8").catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
      },
    );
    return boundaries.split("\n").includes(commit) ? null : date;
  } catch {
    return null;
  }
}
