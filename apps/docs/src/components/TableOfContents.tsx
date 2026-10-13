import { type JSX } from "@vincle/core";

import { useDocs, useTranslation } from "../lib/context.js";
import { groupToc, type TocEntry } from "../lib/toc.js";

function TocLink({ entry }: { entry: TocEntry }): JSX.Element {
  const padding = entry.level === 3 ? "pl-6" : "pl-3";
  const size = entry.level === 3 ? "text-xs" : "text-sm";
  return (
    <a
      href={`#${entry.id}`}
      class={`docs-toc-link block py-1 ${padding} ${size} text-[var(--docs-color-text-secondary)] transition-colors hover:text-[var(--docs-color-text)]`}
    >
      {entry.text}
    </a>
  );
}

export function TableOfContents(): JSX.Element | null {
  const groups = groupToc(useDocs().toc ?? []);
  if (groups.length === 0) return null;
  const t = useTranslation();
  return (
    <aside class="docs-toc sticky top-8 text-sm" aria-label={t("contents")}>
      <p class="docs-toc-title m-0 mb-2 text-xs font-semibold tracking-wider text-[var(--docs-color-text-secondary)] uppercase">
        {t("onThisPage")}
      </p>
      <div class="docs-toc-track">
        <div class="docs-toc-marker" aria-hidden="true"></div>
        <ul class="docs-toc-list m-0 list-none border-l border-[var(--docs-color-border)] p-0">
          {groups.map((group) => (
            <li class={`docs-toc-entry docs-toc-level-${group.level} m-0`}>
              <TocLink entry={group} />
              {group.children.length > 0 && (
                <ul class="docs-toc-sublist m-0 list-none p-0">
                  {group.children.map((child) => (
                    <li class="docs-toc-entry docs-toc-level-3 m-0">
                      <TocLink entry={child} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
