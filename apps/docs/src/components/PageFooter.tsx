import { useDocs, useTranslation } from "../lib/context.js";
import { localeFor, unlocalizedPath, type Locale } from "../lib/i18n/locale.js";
import { Icon } from "./Icon.js";

export function PageFooter() {
  const t = useTranslation();
  const { config, editUrl, lastUpdated, prev, next, currentPage } = useDocs();
  const locale = localeFor(currentPage);
  const hasNav = prev !== null || next !== null;
  const isHome = unlocalizedPath(currentPage) === "/";

  return (
    <div class="docs-page-footer-wrapper mt-16">
      {hasNav && (
        <nav class="docs-page-nav flex justify-between border-t border-[var(--docs-color-border)] pt-6">
          {prev ? (
            <a
              href={prev.href}
              class="group inline-flex items-center gap-1 text-sm font-medium text-[var(--docs-color-accent)] transition-colors hover:text-[var(--docs-color-accent-hover)]"
            >
              <Icon
                name="tabler:chevron-left"
                size={14}
                class="size-3.5 -translate-x-0 transition-transform group-hover:-translate-x-0.5"
              />
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
              <Icon
                name="tabler:chevron-right"
                size={14}
                class="size-3.5 translate-x-0 transition-transform group-hover:translate-x-0.5"
              />
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
      <footer class="docs-page-footer mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--docs-color-border)] pt-6 text-sm text-[var(--docs-color-text-secondary)]">
        <span>
          {config.title} · {t("createdBy")}{" "}
          <a
            href="https://www.cjean.fr/"
            rel="author"
            class="transition-colors hover:text-[var(--docs-color-text)]"
          >
            Christophe Jean
          </a>
        </span>
        {isHome && (
          <>
            <a href="https://www.npmjs.com/package/@vincle/core">{t("onNpm")}</a>
            <a href="https://github.com/cjean-fr/vincle/blob/main/LICENSE">{t("mitLicensed")}</a>
          </>
        )}
        {editUrl && (
          <a
            class="docs-page-footer-edit inline-flex items-center gap-1 transition-colors hover:text-[var(--docs-color-text)]"
            href={editUrl}
            target="_blank"
            rel="noopener"
          >
            {t("editPage")}
          </a>
        )}
        {lastUpdated && (
          <time class="docs-page-footer-updated" dateTime={lastUpdated}>
            {t("lastUpdated", { date: formatDate(lastUpdated, locale) })}
          </time>
        )}
      </footer>
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
