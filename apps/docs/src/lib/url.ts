/** The Markdown twin of a page URL (`/` is `/index.md`). */
export function markdownPath(url: string): string {
  return url === "/" ? "/index.md" : `${url}.md`;
}
