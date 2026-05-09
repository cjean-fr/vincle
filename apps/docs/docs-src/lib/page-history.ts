/** Where a page comes from, and when it last changed — the two `PageFooter` values. */
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname!, "../..");

/** `{editUrl}/{path within the app}` — the base carries host, branch and app dir. */
export function editUrlFor(base: string | null, file: string): string | null {
  if (!base) return null;
  const rel = path.relative(APP_ROOT, file);
  // A page outside the app has no position in the repository.
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `${base.replace(/\/+$/, "")}/${rel.split(path.sep).join("/")}`;
}

/** Promises, not values: caching the value would leave a window across the spawn. */
const cache = new Map<string, Promise<string | null>>();

/**
 * Commit date of the last change to `file`, ISO 8601, or `null`.
 *
 * Git, not `stat`: a CI checkout dates every file to the clone. `null` covers
 * no git, a shallow clone, an untracked page — the footer omits the line.
 */
export function lastModified(file: string): Promise<string | null> {
  const hit = cache.get(file);
  if (hit !== undefined) return hit;

  const run = async (): Promise<string | null> => {
    try {
      const proc = Bun.spawn(["git", "log", "-1", "--format=%cI", "--", file], {
        cwd: APP_ROOT,
        stdout: "pipe",
        stderr: "ignore",
      });
      const out = (await new Response(proc.stdout).text()).trim();
      return (await proc.exited) === 0 && out !== "" ? out : null;
    } catch {
      return null;
    }
  };

  const promise = run();
  cache.set(file, promise);
  return promise;
}

export function clearHistoryCache(): void {
  cache.clear();
}
