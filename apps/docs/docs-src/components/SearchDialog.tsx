export function SearchDialog() {
  return (
    <search>
      <button
        data-search-trigger
        type="button"
        class="docs-search-trigger inline-flex items-center gap-1.5 rounded-lg border border-[var(--docs-color-border)] bg-transparent px-2.5 py-1.5 text-sm text-[var(--docs-color-text-secondary)] transition-colors hover:border-[var(--docs-color-accent)] hover:text-[var(--docs-color-text)] max-sm:hidden md:px-3"
      >
        <svg
          class="docs-search-icon size-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          />
        </svg>
        <span class="docs-search-trigger-label hidden md:inline">Search</span>
        <kbd class="docs-search-kbd hidden items-center gap-0.5 rounded border border-[var(--docs-color-border)] bg-[var(--docs-color-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--docs-color-text-secondary)] sm:inline-flex">
          <span class="text-base leading-none">⌘</span>K
        </kbd>
      </button>

      <dialog
        id="search-dialog"
        class="docs-search-dialog m-0 mx-auto mt-[15vh] w-full max-w-xl rounded-xl border border-[var(--docs-color-border)] bg-[var(--docs-color-bg)] p-0 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm open:flex open:flex-col"
        aria-label="Search documentation"
      >
        <div class="docs-search-input-row flex items-center gap-3 border-b border-[var(--docs-color-border)] px-4 py-3">
          <svg
            class="docs-search-icon size-5 shrink-0 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            />
          </svg>
          <input
            id="search-input"
            type="search"
            placeholder="Loading index…"
            class="docs-search-input flex-1 bg-transparent px-1 text-[var(--docs-color-text)] outline-none placeholder:text-[var(--docs-color-text-secondary)] disabled:opacity-50"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck={false}
            disabled
            aria-label="Search query"
            aria-controls="search-results"
            aria-describedby="search-status"
          />
          <kbd class="docs-search-kbd hidden items-center rounded border border-[var(--docs-color-border)] bg-[var(--docs-color-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--docs-color-text-secondary)] sm:inline-flex">
            Esc
          </kbd>
        </div>

        <p
          id="search-status"
          class="docs-search-status px-4 py-6 text-center text-sm text-[var(--docs-color-text-secondary)]"
        >
          Loading…
        </p>

        <ul
          id="search-results"
          class="docs-search-results m-0 max-h-[60vh] overflow-y-auto py-2"
          role="listbox"
          aria-label="Search results"
        ></ul>
      </dialog>
    </search>
  );
}
