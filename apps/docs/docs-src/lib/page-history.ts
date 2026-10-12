/** Source links and the homepage content modification date. */
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname!, "../..");

/** `{editUrl}/{path within the app}`: the base carries host, branch and app dir. */
export function editUrlFor(base: string | null, file: string): string | null {
  if (!base) return null;
  const rel = path.relative(APP_ROOT, file);
  // A page outside the app has no position in the repository.
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `${base.replace(/\/+$/, "")}/${rel.split(path.sep).join("/")}`;
}

/** One history lookup for the whole content directory, used by the homepage. */
export async function lastModified(pagesDir: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "log", "-1", "--format=%cI", "--", "."], {
      cwd: path.resolve(pagesDir),
      stdout: "pipe",
      stderr: "ignore",
    });
    const date = (await new Response(proc.stdout).text()).trim();
    return (await proc.exited) === 0 && Number.isFinite(Date.parse(date)) ? date : null;
  } catch {
    return null;
  }
}
