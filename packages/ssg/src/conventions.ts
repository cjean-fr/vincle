import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

/** Prefer isolated route sources; retain src for existing flat projects. */
export function sourceDirectory(root: string, src?: string): string {
  if (src !== undefined) return path.resolve(root, src);
  const pages = path.join(root, "src/pages");
  return existsSync(pages) ? pages : path.join(root, "src");
}

function clientDirectories(root: string, src: string): string[] {
  return [...new Set([path.join(root, "src/_client"), path.join(src, "_client")])];
}

/** Select a conventional script and its standalone stylesheet from the first client directory. */
export async function clientEntries(root: string, src: string): Promise<string[]> {
  for (const directory of clientDirectories(root, src)) {
    const entries: string[] = [];
    for (const extension of ["ts", "js", "tsx", "jsx", "css"]) {
      if (entries.length && extension !== "css") continue;
      const entry = path.join(directory, `main.${extension}`);
      try {
        if ((await stat(entry)).isFile()) entries.push(entry);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (entries.length) return entries;
  }
  return [];
}
