import { Scope, type ScopeKey } from "@vincle/core";

/** A heading shown in the table of contents. */
export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export interface TocGroup extends TocEntry {
  children: TocEntry[];
}

const Toc: ScopeKey<readonly TocEntry[]> = Scope.key<readonly TocEntry[]>("@vincle/docs:toc");

/** The MDX handler sets its page's headings; the layout reads them. */
export function setToc(entries: readonly TocEntry[]): void {
  Scope.set(Toc, entries);
}

export function useToc(): readonly TocEntry[] {
  return Scope.get(Toc);
}

/** h3 entries nest under the preceding h2; a leading h3 stands alone. */
export function groupToc(entries: readonly TocEntry[]): TocGroup[] {
  const groups: TocGroup[] = [];
  let current: TocGroup | null = null;
  for (const entry of entries) {
    if (entry.level === 3 && current) current.children.push(entry);
    else {
      const group: TocGroup = { ...entry, children: [] };
      if (entry.level === 2) current = group;
      groups.push(group);
    }
  }
  return groups;
}
