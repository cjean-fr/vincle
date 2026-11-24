import { execFile } from "node:child_process";
/** Source links and tracked content revision dates. */
import { readFile, stat } from "node:fs/promises";
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

interface GitHistory {
  /** Absolute file path → newest touching commit. First log occurrence wins. */
  files: Map<string, { sha: string; date: string }>;
  /** Newest-first commits with the files each touched, for directory queries. */
  commits: { sha: string; date: string; files: string[] }[];
  /** Shallow boundary commits: their recorded date is not the true revision. */
  boundaries: Set<string>;
}

export interface PageHistory {
  lastModified(source: string): Promise<string | null>;
}

/**
 * Read the whole history once: one `git log --name-only`, a map from path to
 * its newest touching commit. Asking per page instead spawns one fork/exec per
 * page, which dominates the I/O of a large site build.
 */
async function readGitHistory(cwd: string): Promise<GitHistory> {
  const empty: GitHistory = { files: new Map(), commits: [], boundaries: new Set() };
  try {
    const { stdout: topOut } = await run("git", ["rev-parse", "--show-toplevel"], { cwd });
    const top = topOut.trim();
    const { stdout: shallow } = await run(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-path", "shallow"],
      { cwd: top },
    );
    const boundaries = new Set(
      (
        await readFile(shallow.trim(), "utf8").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return "";
          throw error;
        })
      )
        .split("\n")
        .filter(Boolean),
    );
    const { stdout } = await run(
      "git",
      ["log", "--format=commit %H %cI", "--name-only", "--", "."],
      { cwd: top, maxBuffer: 64 * 1024 * 1024 },
    );
    const files = new Map<string, { sha: string; date: string }>();
    const commits: GitHistory["commits"] = [];
    let current: { sha: string; date: string; files: string[] } | undefined;
    for (const line of stdout.split("\n")) {
      if (line === "") continue;
      const header = /^commit ([0-9a-f]{40}) (\S+)$/.exec(line);
      if (header) {
        const [, sha, date] = header;
        if (!sha || !date) continue;
        current = { sha, date, files: [] };
        commits.push(current);
        continue;
      }
      if (!current) continue;
      const absolute = path.join(top, line);
      current.files.push(absolute);
      if (!files.has(absolute)) files.set(absolute, { sha: current.sha, date: current.date });
    }
    return { files, commits, boundaries };
  } catch {
    return empty;
  }
}

function lastModifiedFrom({ files, commits, boundaries }: GitHistory) {
  return async (source: string): Promise<string | null> => {
    try {
      const absolute = path.resolve(source);
      const directory = (await stat(absolute)).isDirectory();
      if (!directory) {
        const record = files.get(absolute);
        if (!record || boundaries.has(record.sha)) return null;
        return record.date;
      }
      const prefix = absolute.endsWith(path.sep) ? absolute : absolute + path.sep;
      for (const commit of commits) {
        if (commit.files.some((file) => file.startsWith(prefix)))
          return boundaries.has(commit.sha) ? null : commit.date;
      }
      return null;
    } catch {
      return null;
    }
  };
}

/** A fresh snapshot of the repository's page history, shared by every page of a build. */
export async function readPageHistory(): Promise<PageHistory> {
  return { lastModified: lastModifiedFrom(await readGitHistory(APP_ROOT)) };
}

/** Last tracked revision of a page or content directory, never the build time. */
export async function lastModified(source: string): Promise<string | null> {
  try {
    const absolute = path.resolve(source);
    const directory = (await stat(absolute)).isDirectory();
    const history = await readGitHistory(directory ? absolute : path.dirname(absolute));
    return lastModifiedFrom(history)(source);
  } catch {
    return null;
  }
}
