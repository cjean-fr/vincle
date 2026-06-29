import { escapeHtml } from "../lib/escape.js";

interface SearchDocument {
  url: string;
  title: string;
  text: string;
}

interface SearchHit {
  document: SearchDocument;
  score: number;
}

let index: SearchDocument[] | null = null;

async function loadIndex(): Promise<SearchDocument[]> {
  if (index) return index;
  const res = await fetch("/search-index.json");
  if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);
  index = (await res.json()) as SearchDocument[];
  return index;
}

document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.getElementById(
    "search-dialog",
  ) as HTMLDialogElement | null;
  const input = document.getElementById(
    "search-input",
  ) as HTMLInputElement | null;
  const status = document.getElementById("search-status") as HTMLElement | null;
  const results = document.getElementById(
    "search-results",
  ) as HTMLElement | null;
  if (!dialog || !input || !status || !results) return;

  const searchDialog = dialog;
  const searchInput = input;
  const searchStatus = status;
  const searchResults = results;
  let selectedIndex = -1;

  function clearResults() {
    searchResults.replaceChildren();
    searchResults.classList.add("hidden");
    searchStatus.classList.remove("hidden");
  }

  async function open(trigger?: Element | null) {
    // Morph origin: map trigger position relative to dialog center
    if (trigger instanceof HTMLElement) {
      const t = trigger.getBoundingClientRect();
      // showModal first so dialog has its final layout
      searchDialog.showModal();
      const d = searchDialog.getBoundingClientRect();
      const ox = ((t.left + t.width / 2 - d.left) / d.width) * 100;
      const oy = ((t.top + t.height / 2 - d.top) / d.height) * 100;
      searchDialog.style.setProperty("--search-origin-x", ox + "%");
      searchDialog.style.setProperty("--search-origin-y", oy + "%");
      searchDialog.style.transformOrigin =
        "var(--search-origin-x) var(--search-origin-y)";
    } else {
      searchDialog.showModal();
    }
    if (!index) {
      searchStatus.textContent = "Loading search…";
      searchInput.disabled = true;
      try {
        await loadIndex();
        searchStatus.textContent = "Ready";
        searchInput.disabled = false;
        searchInput.focus();
      } catch {
        searchStatus.textContent = "Failed to load search";
      }
    } else {
      searchInput.focus();
    }
  }

  function close() {
    if (searchDialog.classList.contains("closing")) return;
    // Animate out (transition) → then close dialog
    searchDialog.classList.add("closing");
    searchDialog.addEventListener(
      "transitionend",
      () => {
        searchDialog.close();
        searchDialog.classList.remove("closing");
      },
      { once: true },
    );
    selectedIndex = -1;
  }

  async function render(q: string) {
    const docs = await loadIndex();

    if (!q.trim()) {
      searchStatus.textContent = "Type to search";
      clearResults();
      return;
    }

    const ranked = search(docs, q);

    if (ranked.length === 0) {
      searchStatus.textContent = "No results";
      clearResults();
      return;
    }

    searchStatus.textContent = `${ranked.length} results`;
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
    searchResults.classList.remove("hidden");
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
      const link = el.querySelector("a");
      if (link) link.setAttribute("aria-selected", String(i === selectedIndex));
    });
    if (selectedIndex >= 0 && items[selectedIndex]) {
      items[selectedIndex]!.scrollIntoView({ block: "nearest" });
    }
  }

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

  // Open via any [data-search-trigger] button — pass trigger for morph origin
  document.addEventListener("click", (e) => {
    const trigger = (e.target as Element | null)?.closest(
      "[data-search-trigger]",
    );
    if (trigger) {
      e.preventDefault();
      open(trigger);
    }
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

  searchDialog.addEventListener("close", () => {
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
      updateSelection(
        searchResults.querySelectorAll<HTMLElement>("[data-index]"),
      );
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
    .sort(
      (a, b) =>
        b.score - a.score || a.document.title.localeCompare(b.document.title),
    );
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

function createResultItem(data: {
  index: number;
  url: string;
  title: string;
  excerpt: string;
  query: string;
}) {
  const item = document.createElement("li");
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", "false");
  item.dataset["index"] = String(data.index);

  const link = document.createElement("a");
  link.href = data.url;
  link.className =
    "flex flex-col gap-0.5 px-4 py-2.5 rounded transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 aria-selected:bg-blue-50 dark:aria-selected:bg-blue-950 aria-selected:border-l-2 aria-selected:border-blue-500 aria-selected:pl-3.5";

  const title = document.createElement("span");
  title.className = "font-medium text-sm text-gray-900 dark:text-gray-100";
  appendExcerpt(title, highlightTitle(data.title, data.query));

  const excerpt = document.createElement("span");
  excerpt.className = "text-xs text-gray-500 dark:text-gray-400";
  appendExcerpt(excerpt, data.excerpt);

  link.append(title, excerpt);
  item.append(link);
  return item;
}

function snippet(text: string, query: string, radius = 50): string {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  const match = terms
    .map((term) => ({ term, idx: lower.indexOf(term.toLowerCase()) }))
    .filter((candidate) => candidate.idx >= 0)
    .sort((a, b) => a.idx - b.idx)[0];

  if (!match) {
    return escapeHtml(text.slice(0, 120)) + (text.length > 120 ? "..." : "");
  }

  const start = Math.max(0, match.idx - radius);
  const end = Math.min(text.length, match.idx + match.term.length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  const before = escapeHtml(text.slice(start, match.idx));
  const matchedText = escapeHtml(
    text.slice(match.idx, match.idx + match.term.length),
  );
  const after = escapeHtml(text.slice(match.idx + match.term.length, end));
  return `${prefix}${before}<mark>${matchedText}</mark>${after}${suffix}`;
}

function highlightTitle(text: string, query: string): string {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return escapeHtml(text);

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

  let result = "";
  let cursor = 0;
  for (const { start, end } of merged) {
    result += escapeHtml(text.slice(cursor, start));
    result += `<mark>${escapeHtml(text.slice(start, end))}</mark>`;
    cursor = end;
  }
  result += escapeHtml(text.slice(cursor));
  return result;
}

function appendExcerpt(target: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const node of parsed.body.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.append(document.createTextNode(node.textContent ?? ""));
      continue;
    }
    if (node instanceof HTMLElement && node.tagName === "MARK") {
      const mark = document.createElement("mark");
      mark.className = "bg-yellow-200 dark:bg-yellow-800 rounded px-0.5";
      mark.textContent = node.textContent;
      target.append(mark);
    } else {
      target.append(document.createTextNode(node.textContent ?? ""));
    }
  }
}
