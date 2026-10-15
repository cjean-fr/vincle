import { useDocs, useTranslation } from "../lib/context.js";
import { unlocalizedPath } from "../lib/i18n/locale.js";

/**
 * Top-level nav links, rendered in the header bar. Each tab links to its first
 * page in reading order (or an explicit `href` resolved at build start).
 */
export function Tabs() {
  const t = useTranslation();
  const { resolvedTabs, currentTab, currentPage } = useDocs();

  // Error pages: no tab context.
  if (currentTab === null && unlocalizedPath(currentPage) !== "/") return null;

  return (
    <nav
      class="docs-tabs-bar ml-2 flex items-center gap-0.5 overflow-x-auto max-md:hidden"
      aria-label={t("sections")}
    >
      {resolvedTabs.map((tab) => (
        <a
          key={tab.slug}
          href={tab.href}
          aria-current={currentTab && tab.slug === currentTab.slug ? "page" : undefined}
          class={tabClass(currentTab ? tab.slug === currentTab.slug : false)}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}

/** The header tabs, as a segmented control at the top of the mobile drawer where the header has no room. */
export function DrawerTabs() {
  const t = useTranslation();
  const { resolvedTabs, currentTab, currentPage } = useDocs();

  if (currentTab === null && unlocalizedPath(currentPage) !== "/") return null;

  return (
    <nav
      class="docs-drawer-tabs grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-[var(--docs-color-surface)] p-1"
      aria-label={t("sections")}
    >
      {resolvedTabs.map((tab) => {
        const current = currentTab !== null && tab.slug === currentTab.slug;
        return (
          <a
            key={tab.slug}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            class={`docs-tab-link flex min-h-9 items-center justify-center truncate rounded-md px-2 text-sm font-medium transition-colors ${
              current
                ? "bg-[var(--docs-color-bg)] text-[var(--docs-color-accent)] shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
                : "text-[var(--docs-color-text-secondary)] hover:text-[var(--docs-color-text)]"
            }`}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}

function tabClass(current: boolean): string {
  const base =
    "docs-tab-link inline-flex shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-medium transition-colors";
  return current
    ? `${base} text-[var(--docs-color-accent)]`
    : `${base} text-[var(--docs-color-text-secondary)] hover:text-[var(--docs-color-text)]`;
}
