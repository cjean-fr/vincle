import { escapeHtml } from "./escape.js";

const PLACEHOLDER_RE = /<aside\s+data-toc-placeholder\s*><\/aside>/i;

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

interface GroupedEntry {
  id: string;
  text: string;
  level: number;
  children: TocEntry[];
}

export function injectToc(
  html: string,
  renderToc: (entries: TocEntry[]) => string,
): string {
  const entries = extractTocEntries(html);
  if (entries.length === 0) {
    return html.replace(PLACEHOLDER_RE, "");
  }
  const tocHtml = renderToc(entries);
  return html.replace(PLACEHOLDER_RE, tocHtml);
}

function extractTocEntries(html: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>(.*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    entries.push({
      id: match[2]!,
      text: decodeHtmlEntities(stripHtml(match[3]!)),
      level: parseInt(match[1]!, 10),
    });
  }
  return entries;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x60;/g, "`");
}

export const TOC_PLACEHOLDER = "<aside data-toc-placeholder></aside>";

function groupEntries(entries: TocEntry[]): GroupedEntry[] {
  const result: GroupedEntry[] = [];
  let current: GroupedEntry | null = null;

  for (const entry of entries) {
    if (entry.level === 2) {
      current = {
        id: entry.id,
        text: entry.text,
        level: entry.level,
        children: [],
      };
      result.push(current);
    } else if (entry.level === 3) {
      if (current) {
        current.children.push(entry);
      } else {
        result.push({
          id: entry.id,
          text: entry.text,
          level: entry.level,
          children: [],
        });
      }
    }
  }

  return result;
}

function renderTocLink(entry: TocEntry): string {
  const padding = entry.level === 3 ? "pl-6" : "pl-3";
  const size = entry.level === 3 ? "text-xs" : "text-sm";
  return `<a href="#${entry.id}" class="docs-toc-link block py-1 ${padding} ${size} text-[var(--docs-color-text-secondary)] hover:text-[var(--docs-color-text)] transition-colors">${escapeHtml(entry.text)}</a>`;
}

function renderGroup(group: GroupedEntry): string {
  let sublist = "";
  if (group.children.length > 0) {
    const items = group.children
      .map(
        (c) =>
          `<li class="docs-toc-entry docs-toc-level-3 m-0">${renderTocLink(c)}</li>`,
      )
      .join("");
    sublist = `<ul class="docs-toc-sublist list-none p-0 m-0">${items}</ul>`;
  }
  return `<li class="docs-toc-entry docs-toc-level-${group.level} m-0">${renderTocLink(group)}${sublist}</li>`;
}

export function renderTocHtml(entries: TocEntry[]): string {
  const groups = groupEntries(entries);
  const items = groups.map((g) => renderGroup(g)).join("");
  return (
    `<aside class="docs-toc sticky top-8 text-sm" aria-label="Table of contents">` +
    `<p class="docs-toc-title m-0 mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--docs-color-text-secondary)]">On this page</p>` +
    `<div class="docs-toc-track">` +
    `<div class="docs-toc-marker" aria-hidden="true"></div>` +
    `<ul class="docs-toc-list list-none p-0 m-0 border-l border-[var(--docs-color-border)]">${items}</ul>` +
    `</div>` +
    `</aside>`
  );
}
