import { useDocs } from "../context.js";

/**
 * Top-level nav links, rendered in the header bar. Each tab links to its first
 * page in reading order (or an explicit `href` resolved at build start).
 */
export function Tabs() {
  const { resolvedTabs, currentTab, currentPage } = useDocs();

  // Error pages — no tab context.
  if (currentTab === null && currentPage !== "/") return null;

  return (
    <nav
      class="docs-tabs-bar ml-2 flex items-center gap-0.5 overflow-x-auto max-sm:hidden"
      aria-label="Sections"
    >
      {resolvedTabs.map((tab) => (
        <a
          key={tab.slug}
          href={tab.href}
          aria-current={
            currentTab && tab.slug === currentTab.slug ? "page" : undefined
          }
          class={tabClass(currentTab ? tab.slug === currentTab.slug : false)}
        >
          {tab.label}
        </a>
      ))}
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
