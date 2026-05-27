import { raw } from "@vincle/core";

const HAMBURGER = raw(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>`,
);

const CLOSE = raw(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
);

export function NavToggle() {
  return (
    <button
      type="button"
      data-docs-nav-toggle
      aria-label="Open navigation"
      aria-expanded="false"
      aria-controls="docs-nav"
      class="docs-nav-toggle inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--docs-color-text-secondary)] transition-colors hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)] md:hidden"
    >
      <span class="docs-nav-toggle-open">{HAMBURGER}</span>
      <span class="docs-nav-toggle-close" hidden>
        {CLOSE}
      </span>
    </button>
  );
}
