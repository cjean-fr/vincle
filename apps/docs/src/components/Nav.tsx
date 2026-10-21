import type { ResolvedSidebarItem } from "../lib/types.js";

import { useDocs } from "../lib/context.js";
import { t } from "../lib/messages.js";
import { Icon } from "./Icon.js";
import { DrawerTabs } from "./Tabs.js";

/** `drawerOnly`: no desktop sidebar (home), but phones still get search and sections. */
export function Nav({ drawerOnly = false }: { drawerOnly?: boolean } = {}) {
  const { sidebar } = useDocs();

  return (
    <nav
      id="docs-nav"
      class={`docs-nav pointer-events-none fixed inset-y-0 left-0 z-40 w-full max-w-xs overflow-y-auto border-r border-[var(--docs-color-border)] bg-[var(--docs-color-bg)] md:pointer-events-auto md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:w-56 md:max-w-none md:shrink-0 md:overflow-y-auto md:border-0 md:bg-transparent md:pt-6 md:pr-6${drawerOnly ? " md:hidden" : ""}`}
      aria-label={t("primaryNavigation")}
      tabIndex={-1}
    >
      {/* Search for mobile */}
      <div class="flex h-16 items-center border-b border-[var(--docs-color-border)] px-4 md:hidden">
        <button
          data-search-trigger
          type="button"
          class="docs-search-trigger flex h-11 w-full items-center gap-2 rounded-lg border border-[var(--docs-color-border)] px-3 text-sm text-[var(--docs-color-text-secondary)] hover:border-[var(--docs-color-accent)] hover:text-[var(--docs-color-text)]"
          aria-label={t("searchDocumentation")}
        >
          <Icon name="tabler:search" size={16} class="size-4 shrink-0" />
          {t("search")}
        </button>
      </div>

      <div class="px-4 pt-4 md:hidden">
        <DrawerTabs />
      </div>

      <div class="px-4 pt-4 pb-8 md:px-0 md:pt-0">
        {sidebar.groups.map((group, gi) => (
          <div class="docs-nav-group space-y-0.5" key={gi}>
            {group.items.map((item) => renderNavItem(item))}
          </div>
        ))}
      </div>
    </nav>
  );
}

/** Pages and category headings share one left edge; a category's pages sit indented behind a guide rail. */
function renderNavItem(item: ResolvedSidebarItem) {
  if (item.kind === "page") {
    return (
      <a
        key={item.href}
        href={item.href}
        class={navLinkClass(item.current)}
        aria-current={item.current ? "page" : undefined}
      >
        {item.label}
      </a>
    );
  }

  return (
    <div key={item.label} class="docs-nav-category py-4 first:pt-0 last:pb-0">
      <div class="px-3 pb-1.5 text-xs font-semibold tracking-wide text-[var(--docs-color-text)] uppercase">
        {item.label}
      </div>
      <div class="ml-3 space-y-0.5 border-l border-[var(--docs-color-border)] pl-1.5">
        {item.items.map((child) => renderNavItem(child))}
      </div>
    </div>
  );
}

function navLinkClass(current: boolean): string {
  const base =
    "docs-nav-link flex items-center rounded-md px-3 py-2 text-sm transition-colors duration-150 md:py-1.5";
  return current
    ? `${base} docs-nav-link-current text-[var(--docs-color-accent)] font-medium`
    : `${base} text-[var(--docs-color-text-secondary)] hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)]`;
}
