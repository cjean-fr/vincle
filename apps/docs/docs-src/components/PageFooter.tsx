import { useDocs } from "../context.js";

export function PageFooter() {
  const { editUrl, lastUpdated, prev, next } = useDocs();
  const hasNav = prev !== null || next !== null;
  const hasFooter = editUrl !== null || lastUpdated !== null;

  if (!hasNav && !hasFooter) return null;

  return (
    <div class="docs-page-footer-wrapper mt-16">
      {hasNav && (
        <nav class="docs-page-nav flex justify-between border-t border-[var(--docs-color-border)] pt-6">
          {prev ? (
            <a
              href={prev.href}
              class="inline-flex items-center gap-1 text-sm font-medium text-[var(--docs-color-accent)] transition-colors hover:text-[var(--docs-color-accent-hover)] group"
            >
              <svg
                class="size-3.5 transition-transform -translate-x-0 group-hover:-translate-x-0.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M10 12L6 8l4-4" />
              </svg>
              {prev.label}
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a
              href={next.href}
              class="inline-flex items-center gap-1 text-sm font-medium text-[var(--docs-color-accent)] transition-colors hover:text-[var(--docs-color-accent-hover)] group"
            >
              {next.label}
              <svg
                class="size-3.5 transition-transform translate-x-0 group-hover:translate-x-0.5"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M6 4l4 4-4 4" />
              </svg>
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
      {hasFooter && (
        <footer class="docs-page-footer mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--docs-color-border)] pt-6 text-sm text-[var(--docs-color-text-secondary)]">
          {editUrl ? (
            <a
              class="docs-page-footer-edit inline-flex items-center gap-1 transition-colors hover:text-[var(--docs-color-text)]"
              href={editUrl}
              target="_blank"
              rel="noopener"
            >
              Edit this page on GitHub →
            </a>
          ) : (
            <span />
          )}
          {lastUpdated && (
            <time class="docs-page-footer-updated" datetime={lastUpdated}>
              Last updated: {formatDate(lastUpdated)}
            </time>
          )}
        </footer>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
