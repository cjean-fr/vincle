import type { ResolvedSidebarItem } from "../lib/types.js";

import { useDocs, useTranslation } from "../lib/context.js";
import { Icon } from "./Icon.js";

export function Nav() {
  const t = useTranslation();
  const { sidebar } = useDocs();

  return (
    <nav
      id="docs-nav"
      class="docs-nav pointer-events-none fixed inset-y-0 left-0 z-40 w-full max-w-xs overflow-y-auto border-r border-[var(--docs-color-border)] bg-[var(--docs-color-bg)] md:pointer-events-auto md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:w-56 md:max-w-none md:shrink-0 md:overflow-y-auto md:border-0 md:bg-transparent md:pt-6 md:pr-6"
      aria-label={t("primaryNavigation")}
      tabIndex={-1}
    >
      {/* Search for mobile */}
      <div class="border-b border-[var(--docs-color-border)] px-6 pt-6 pb-4 md:hidden">
        <button
          data-search-trigger
          type="button"
          class="flex w-full items-center gap-2 rounded-lg border border-[var(--docs-color-border)] px-3 py-2 text-sm text-[var(--docs-color-text-secondary)] transition-colors hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)]"
          aria-label={t("searchDocumentation")}
        >
          <Icon name="tabler:search" size={16} class="size-4 shrink-0" />
          {t("search")}
        </button>
      </div>

      <div class="px-6 md:px-0">
        {sidebar.groups.map((group, gi) => (
          <div class="docs-nav-group" key={gi}>
            {group.items.map((item) => renderNavItem(item, 0))}
          </div>
        ))}
      </div>
    </nav>
  );
}

function renderNavItem(item: ResolvedSidebarItem, depth: number) {
  if (item.kind === "page") {
    return (
      <div key={item.href} class="docs-nav-page-item">
        <a
          href={item.href}
          class={navLinkClass(item.current, depth)}
          aria-current={item.current ? "page" : undefined}
        >
          {item.label}
        </a>
      </div>
    );
  }

  return (
    <div key={item.label} class={`docs-nav-category ${depth === 0 ? "mt-6 first:mt-0" : ""}`}>
      <div class="py-2 text-xs font-semibold text-[var(--docs-color-text)]">{item.label}</div>
      <div class="mt-1">{item.items.map((child) => renderNavItem(child, depth + 1))}</div>
    </div>
  );
}

function depthClass(depth: number): string {
  if (depth === 0) return "text-sm font-medium";
  if (depth === 1) return "text-sm";
  return "text-xs";
}

function navLinkClass(current: boolean, depth: number): string {
  const base =
    "docs-nav-link block rounded-r-md border-l-2 py-1.5 pl-3 pr-3 transition-colors duration-150 " +
    depthClass(depth);
  return current
    ? `${base} docs-nav-link-current border-[var(--docs-color-accent)] text-[var(--docs-color-accent)] font-medium`
    : `${base} border-transparent text-[var(--docs-color-text-secondary)] hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)]`;
}
