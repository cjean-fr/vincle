import { translatorFor } from "../lib/i18n/interface.js";
import { browserLocale, localizedPath } from "../lib/i18n/locale.js";

export interface SearchDocument {
  url: string;
  title: string;
  text: string;
}

interface SearchHit {
  document: SearchDocument;
  score: number;
}

/** A run of result text: plain, or the part the query matched. */
interface Segment {
  text: string;
  marked: boolean;
}

/** How much of a query a fragment may carry before it stops being a link. */
const MAX_FRAGMENT_LENGTH = 200;

let index: SearchDocument[] | null = null;

async function loadIndex(): Promise<SearchDocument[]> {
  if (index) return index;
  const res = await fetch(localizedPath("/search-index.json", browserLocale()));
  if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);
  index = (await res.json()) as SearchDocument[];
  return index;
}

document.addEventListener("DOMContentLoaded", () => {
  const t = translatorFor(browserLocale());
  const dialog = document.getElementById("search-dialog") as HTMLDialogElement | null;
  const input = document.getElementById("search-input") as HTMLInputElement | null;
  const status = document.getElementById("search-status") as HTMLElement | null;
  const results = document.getElementById("search-results") as HTMLElement | null;
  if (!dialog || !input || !status || !results) return;

  const searchDialog = dialog;
  const searchInput = input;
  const searchStatus = status;
  const searchResults = results;
  let selectedIndex = -1;
  let dialogAnimation: Animation | undefined;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clearResults() {
    searchResults.replaceChildren();
    searchResults.classList.remove("active");
    searchStatus.classList.remove("hidden");
  }

  async function open() {
    if (searchDialog.open) return;
    searchDialog.showModal();
    if (!reducedMotion()) {
      dialogAnimation = searchDialog.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 160,
        easing: "ease-out",
      });
    }
    if (!index) {
      searchStatus.textContent = t("loadingSearch");
      searchInput.disabled = true;
      try {
        await loadIndex();
        searchInput.disabled = false;
        searchInput.placeholder = t("searchPlaceholder");
      } catch {
        searchStatus.textContent = t("searchFailed");
        return;
      }
    }
    if (searchDialog.open && !searchDialog.classList.contains("closing")) {
      searchInput.focus();
      render(searchInput.value);
    }
  }

  function close() {
    if (!searchDialog.open || searchDialog.classList.contains("closing")) return;
    dialogAnimation?.cancel();
    searchDialog.classList.add("closing");
    selectedIndex = -1;
    if (reducedMotion()) {
      searchDialog.close();
      return;
    }
    dialogAnimation = searchDialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 120,
      easing: "ease-in",
      fill: "forwards",
    });
    dialogAnimation.onfinish = () => searchDialog.close();
  }

  async function render(q: string) {
    const docs = await loadIndex();

    if (!q.trim()) {
      searchStatus.textContent = t("typeToSearch");
      clearResults();
      return;
    }

    const ranked = search(docs, q);

    if (ranked.length === 0) {
      searchStatus.textContent = t("noResults");
      clearResults();
      return;
    }

    searchStatus.textContent = t("resultCount", { count: ranked.length });
    searchStatus.classList.add("hidden");
    selectedIndex = -1;

    const items = await Promise.all(
      ranked.slice(0, 10).map((hit, i) =>
        createResultItem({
          index: i,
          url: hit.document.url,
          title: hit.document.title,
          excerpt: snippet(hit.document.text, q),
          query: q,
        }),
      ),
    );
    searchResults.replaceChildren(...items);
    searchResults.classList.add("active");
  }

  function selectNext() {
    const items = searchResults.querySelectorAll<HTMLElement>("[data-index]");
    if (items.length === 0) return;
    selectedIndex = (selectedIndex + 1) % items.length;
    updateSelection(items);
  }

  function selectPrev() {
    const items = searchResults.querySelectorAll<HTMLElement>("[data-index]");
    if (items.length === 0) return;
    selectedIndex = (selectedIndex - 1 + items.length) % items.length;
    updateSelection(items);
  }

  function updateSelection(items: NodeListOf<HTMLElement>) {
    items.forEach((el, i) => {
      el.setAttribute("aria-selected", String(i === selectedIndex));
    });
    if (selectedIndex >= 0 && items[selectedIndex]) {
      items[selectedIndex]!.scrollIntoView({ block: "nearest" });
    }
  }

  /** A click is ours only to dismiss the dialog: the anchor does the travel. */
  function follow() {
    const items = searchResults.querySelectorAll<HTMLElement>("[data-index]");
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      const link = items[selectedIndex]!.querySelector<HTMLAnchorElement>("a");
      if (link) {
        location.href = link.href;
        close();
      }
    }
  }

  // Open via any search trigger.
  document.addEventListener("click", (e) => {
    const trigger = (e.target as Element | null)?.closest("[data-search-trigger]");
    if (trigger) {
      e.preventDefault();
      open();
    }
  });

  // Nothing is intercepted: the anchor carries the query and the page reads it.
  // A modified click opens its tab or window, so the dialog stays put.
  searchResults.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    if ((e.target as Element | null)?.closest(".docs-search-result")) close();
  });

  searchDialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectNext();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      selectPrev();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      follow();
      return;
    }
  });

  // Close when clicking outside (on the backdrop)
  searchDialog.addEventListener("click", (e) => {
    if (e.target === searchDialog) close();
  });

  searchDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  searchDialog.addEventListener("close", () => {
    dialogAnimation?.cancel();
    searchInput.value = "";
    searchInput.blur();
    searchDialog.classList.remove("closing");
  });

  let debounceTimer: ReturnType<typeof setTimeout>;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => render(searchInput.value), 150);
  });

  searchResults.addEventListener("mouseover", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (!item) return;
    const idx = Number(item.dataset["index"]);
    if (!isNaN(idx)) {
      selectedIndex = idx;
      updateSelection(searchResults.querySelectorAll<HTMLElement>("[data-index]"));
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      open();
    }
  });
});

function search(docs: SearchDocument[], query: string): SearchHit[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return docs
    .map((document) => ({ document, score: scoreDocument(document, terms) }))
    .filter((hit) => hit.score > 0)
    .toSorted((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title));
}

function scoreDocument(document: SearchDocument, terms: string[]): number {
  const fields = [
    { value: document.title, weight: 8 },
    { value: document.url.replace(/[/-]+/g, " "), weight: 5 },
    { value: document.text, weight: 1 },
  ];
  let score = 0;

  for (const term of terms) {
    let matchedTerm = false;

    for (const field of fields) {
      if (field.value.toLowerCase().includes(term.toLowerCase())) {
        score += field.weight;
        matchedTerm = true;
      }
    }

    if (!matchedTerm) return 0;
  }

  return score;
}

/**
 * Carries the query to the page that matched, in the fragment.
 *
 * The page reads it on arrival, lights the words and erases the fragment. The
 * standard `#:~:text=` is not usable here: the browser strips that directive
 * from the fragment it exposes to scripts, and it would match the sidebar
 * before the article, the sidebar listing the same titles.
 */
function deepLink(url: string, query: string): string {
  // Repeating a word is not a second passage to light up, only more URL.
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))];
  // A fragment cannot carry both an element id and our parameter.
  if (terms.length === 0 || url.includes("#")) return url;

  const kept: string[] = [];
  let budget = MAX_FRAGMENT_LENGTH;
  for (const term of terms) {
    const length = encodeURIComponent(term).length + (kept.length > 0 ? 1 : 0);
    if (length > budget) break;
    kept.push(term);
    budget -= length;
  }
  return kept.length > 0 ? `${url}#${new URLSearchParams({ q: kept.join(" ") })}` : url;
}

function createResultItem(data: {
  index: number;
  url: string;
  title: string;
  excerpt: Segment[];
  query: string;
}) {
  const item = document.createElement("li");
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", "false");
  item.dataset["index"] = String(data.index);

  const link = document.createElement("a");
  link.href = deepLink(data.url, data.query);
  link.className = "docs-search-result";

  const title = document.createElement("span");
  title.className = "docs-search-result-title";
  appendSegments(title, highlightTitle(data.title, data.query));

  const section = document.createElement("span");
  section.className = "docs-search-result-section";
  section.textContent = sectionOf(data.url);

  const excerpt = document.createElement("span");
  excerpt.className = "docs-search-result-excerpt";
  appendSegments(excerpt, data.excerpt);

  const heading = document.createElement("span");
  heading.className = "docs-search-result-heading";
  heading.append(title, section);

  link.append(heading, excerpt);
  item.append(link);
  return item;
}

/** Pages sharing a title (three "Components") stay distinguishable by where they live. */
function sectionOf(url: string): string {
  const lang = document.documentElement.lang;
  return url
    .split("/")
    .filter((segment, i) => segment && !(i === 1 && segment === lang))
    .slice(0, -1)
    .join(" / ");
}

function snippet(text: string, query: string, radius = 50): Segment[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  const match = terms
    .map((term) => ({ term, idx: lower.indexOf(term.toLowerCase()) }))
    .filter((candidate) => candidate.idx >= 0)
    .toSorted((a, b) => a.idx - b.idx)[0];

  if (!match) {
    return [
      { text: text.slice(0, 120), marked: false },
      ...(text.length > 120 ? [{ text: "...", marked: false }] : []),
    ];
  }

  const start = Math.max(0, match.idx - radius);
  const end = Math.min(text.length, match.idx + match.term.length + radius);
  const segments: Segment[] = [];
  if (start > 0) segments.push({ text: "...", marked: false });
  segments.push({ text: text.slice(start, match.idx), marked: false });
  segments.push({ text: text.slice(match.idx, match.idx + match.term.length), marked: true });
  segments.push({ text: text.slice(match.idx + match.term.length, end), marked: false });
  if (end < text.length) segments.push({ text: "...", marked: false });
  return segments;
}

function highlightTitle(text: string, query: string): Segment[] {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [{ text, marked: false }];

  const lower = text.toLowerCase();
  const matches: { start: number; end: number }[] = [];
  for (const term of terms) {
    const tl = term.toLowerCase();
    let idx = lower.indexOf(tl);
    while (idx >= 0) {
      matches.push({ start: idx, end: idx + term.length });
      idx = lower.indexOf(tl, idx + term.length);
    }
  }

  matches.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const m of matches) {
    const last = merged[merged.length - 1];
    if (last && m.start < last.end) {
      last.end = Math.max(last.end, m.end);
    } else {
      merged.push({ ...m });
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const { start, end } of merged) {
    segments.push({ text: text.slice(cursor, start), marked: false });
    segments.push({ text: text.slice(start, end), marked: true });
    cursor = end;
  }
  segments.push({ text: text.slice(cursor), marked: false });
  return segments;
}

/**
 * Builds the result DOM directly from segments. No HTML string intermediate:
 * the segment list is the only grammar, `textContent` owns the escaping, and
 * there is no parser to keep in trust with the emitter.
 */
function appendSegments(target: HTMLElement, segments: Segment[]): void {
  for (const seg of segments) {
    if (seg.marked) {
      const mark = document.createElement("mark");
      mark.textContent = seg.text;
      target.append(mark);
    } else if (seg.text) {
      target.append(document.createTextNode(seg.text));
    }
  }
}
