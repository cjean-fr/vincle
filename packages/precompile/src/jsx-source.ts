/**
 * Extract the JSX import source declared by a `@jsxImportSource` pragma, if any.
 * Only leading comments are considered, so a mention in code does not count.
 * Returns `null` when no pragma is present (the file is treated as using the
 * configured source).
 */
export function detectJsxImportSource(code: string): string | null {
  const head = code.slice(0, 2048);
  const match = head.match(/@jsxImportSource\s+([^\s*]+)/);
  return match ? match[1]! : null;
}

/**
 * Canonical form of a JSX import source: strip the `/jsx-runtime` or
 * `/jsx-dev-runtime` suffix (and any trailing file extension) so that
 * `@vincle/core` and `@vincle/core/jsx-runtime` compare equal.
 */
export function normalizeJsxSource(src: string): string {
  return src.replace(/\/jsx-(dev-)?runtime(\.[a-z]+)?$/, "").replace(/\.[a-z]+$/, "");
}
