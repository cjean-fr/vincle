import { useDocs } from "../lib/context.js";
import { t } from "../lib/messages.js";
import { Icon } from "./Icon.js";

export function PageFooter() {
  const { config, editUrl, lastUpdated, prev, next, currentPage } = useDocs();
  const hasNav = prev !== null || next !== null;
  const isHome = currentPage === "/";
  const pageFacts = (editUrl || lastUpdated) && (
    <p class="docs-footer-list">
      {lastUpdated && (
        <time class="docs-page-footer-updated" dateTime={lastUpdated}>
          {t("lastUpdated", { date: formatDate(lastUpdated) })}
        </time>
      )}
      {editUrl && (
        <a class="docs-page-footer-edit" href={editUrl} target="_blank" rel="noopener">
          {t("editPage")}
        </a>
      )}
    </p>
  );

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
      <footer
        class={`docs-page-footer mt-8 border-t border-[var(--docs-color-border)] pt-6 pb-2 text-[0.8125rem] text-[var(--docs-color-text-secondary)]${isHome ? " docs-page-footer-home" : ""}`}
      >
        <div class="docs-footer-row">
          <p class="docs-footer-identity">
            <span class="docs-footer-mark" aria-hidden="true">
              v.
            </span>
            <span class="font-semibold text-[var(--docs-color-text)]">{config.title}</span>
            {isHome ? (
              <span class="docs-footer-tagline">{config.description}</span>
            ) : (
              <Author label={t("madeBy")} />
            )}
          </p>
          {isHome ? (
            <p class="docs-footer-list">
              <a href="https://github.com/cjean-fr/vincle">GitHub</a>
              <a href="https://www.npmjs.com/package/@vincle/core">{t("onNpm")}</a>
              <a href="https://github.com/cjean-fr/vincle/blob/main/LICENSE">{t("mitLicensed")}</a>
              <a href="/llms.txt">{t("llmsTxt")}</a>
            </p>
          ) : (
            pageFacts
          )}
        </div>
        {isHome && (
          <div class="docs-footer-row docs-footer-credit">
            <Author label={t("madeBy")} />
            {pageFacts}
          </div>
        )}
      </footer>
    </div>
  );
}

function Author({ label }: { label: string }) {
  return (
    <span>
      {label}{" "}
      <a href="https://www.cjean.fr/" rel="author">
        Christophe Jean
      </a>
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
