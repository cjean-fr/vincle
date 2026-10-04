import { useDocs, useTranslation } from "../context.js";
import { localeFor } from "../i18n/locale.js";

export function LanguageSwitcher() {
  const { currentPage, alternates = [] } = useDocs();
  if (alternates.length < 2) return null;
  const current = localeFor(currentPage);
  const t = useTranslation();
  return (
    <nav aria-label={t("language")} class="flex shrink-0 items-center gap-1 text-xs">
      {alternates.map(({ locale, href }) => (
        <a
          href={href}
          hrefLang={locale}
          lang={locale}
          aria-current={locale === current ? "page" : undefined}
          class={`rounded px-1.5 py-1 ${locale === current ? "font-semibold text-[var(--docs-color-accent)]" : "text-[var(--docs-color-text-secondary)] hover:text-[var(--docs-color-text)]"}`}
        >
          {locale === "en" ? "EN" : "FR"}
        </a>
      ))}
    </nav>
  );
}
