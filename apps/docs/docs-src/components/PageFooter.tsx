import { useDocs, useTranslation } from "../context.js";
import { localeFor, type Locale } from "../i18n/locale.js";

export function PageFooter() {
  const t = useTranslation();
  const { editUrl, lastUpdated, prev, next, currentPage } = useDocs();
  const locale = localeFor(currentPage);
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
              class="group inline-flex items-center gap-1 text-sm font-medium text-[var(--docs-color-accent)] transition-colors hover:text-[var(--docs-color-accent-hover)]"
            >
              <svg
                class="size-3.5 -translate-x-0 transition-transform group-hover:-translate-x-0.5"
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
              class="group inline-flex items-center gap-1 text-sm font-medium text-[var(--docs-color-accent)] transition-colors hover:text-[var(--docs-color-accent-hover)]"
            >
              {next.label}
              <svg
                class="size-3.5 translate-x-0 transition-transform group-hover:translate-x-0.5"
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
              {t("editPage")}
            </a>
          ) : (
            <span />
          )}
          {lastUpdated && (
            <time class="docs-page-footer-updated" dateTime={lastUpdated}>
              {t("lastUpdated", { date: formatDate(lastUpdated, locale) })}
            </time>
          )}
        </footer>
      )}
    </div>
  );
}

function formatDate(iso: string, locale: Locale): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
