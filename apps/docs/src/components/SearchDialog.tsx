import { t } from "../lib/messages.js";
import { Icon } from "./Icon.js";
export function SearchDialog() {
  return (
    <search>
      <button
        data-search-trigger
        aria-label={t("searchDocumentation")}
        type="button"
        class="docs-search-trigger inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--docs-color-border)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--docs-color-text-secondary)] transition-colors hover:border-[var(--docs-color-accent)] hover:text-[var(--docs-color-text)] md:px-3"
      >
        <Icon name="tabler:search" size={16} class="docs-search-icon size-4 shrink-0" />
        <span class="docs-search-trigger-label hidden md:inline">{t("search")}</span>
        {/* Filled in by the client once the platform is known: no shortcut is claimed before. */}
        <kbd
          hidden
          data-search-shortcut
          class="docs-search-kbd items-center gap-0.5 rounded border border-[var(--docs-color-border)] bg-[var(--docs-color-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--docs-color-text-secondary)] [&:not([hidden])]:inline-flex"
        ></kbd>
      </button>

      <dialog
        id="search-dialog"
        class="docs-search-dialog m-0 mx-auto mt-[15vh] w-full max-w-xl rounded-xl border border-[var(--docs-color-border)] bg-[var(--docs-color-bg)] p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:flex-col"
        aria-label={t("searchDocumentation")}
      >
        <div class="docs-search-input-row flex items-center gap-3 border-b border-[var(--docs-color-border)] px-4 py-3">
          <Icon
            name="tabler:search"
            size={20}
            class="docs-search-icon size-5 shrink-0 text-[var(--docs-color-text-secondary)]"
          />
          <input
            id="search-input"
            type="search"
            placeholder={t("loadingIndex")}
            class="docs-search-input min-w-0 flex-1 bg-transparent py-2 text-base text-[var(--docs-color-text)] outline-none placeholder:text-[var(--docs-color-text-secondary)] disabled:opacity-50"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            disabled
            aria-label={t("searchQuery")}
            aria-controls="search-results"
            aria-describedby="search-status"
          />
          <kbd
            hidden
            data-search-keyboard-hint
            class="docs-search-kbd items-center rounded border border-[var(--docs-color-border)] bg-[var(--docs-color-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--docs-color-text-secondary)] [&:not([hidden])]:inline-flex"
          >
            Esc
          </kbd>
        </div>

        <p
          id="search-status"
          class="docs-search-status px-4 py-6 text-center text-sm text-[var(--docs-color-text-secondary)]"
        >
          {t("loading")}
        </p>

        <ul
          id="search-results"
          class="docs-search-results m-0 max-h-[60vh] space-y-0.5 overflow-y-auto p-2"
          role="listbox"
          aria-label={t("searchResults")}
        ></ul>
      </dialog>
    </search>
  );
}
