import { t } from "../lib/messages.js";
import { search, type SearchDocument } from "./search-rank.js";
import { createSearchMachine, type SearchEvent, type SearchState } from "./search-state.js";

/** A run of result text: plain, or the part the query matched. */
interface Segment {
  text: string;
  marked: boolean;
}

/** How much of a query a fragment may carry before it stops being a link. */
const MAX_FRAGMENT_LENGTH = 200;

/** The search dialog renders at most this many results; selection follows the DOM. */
const MAX_RESULTS = 10;

document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.getElementById("search-dialog") as HTMLDialogElement | null;
  const input = document.getElementById("search-input") as HTMLInputElement | null;
  const status = document.getElementById("search-status") as HTMLElement | null;
  const results = document.getElementById("search-results") as HTMLElement | null;
  if (!dialog || !input || !status || !results) return;

  const searchDialog = dialog;
  const searchInput = input;
  const searchStatus = status;
  const searchResults = results;
  const machine = createSearchMachine();

  /** The loaded index. Kept outside the machine: it is a document, not a state. */
  let documents: SearchDocument[] | null = null;
  /** The in-flight index request, so repeated opens retry once, not twice. */
  let loadingIndex: Promise<void> | undefined;
  let dialogAnimation: Animation | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clearResults(): void {
    searchResults.replaceChildren();
    searchResults.classList.remove("active");
    searchStatus.classList.remove("hidden");
  }

  function loadIndex(): void {
    if (documents || loadingIndex) return;
    loadingIndex = (async () => {
      try {
        const response = await fetch("/search-index.json");
        if (!response.ok) throw new Error(`Failed to load search index: ${response.status}`);
        documents = (await response.json()) as SearchDocument[];
        machine.send({ type: "index-loaded" });
      } catch {
        machine.send({ type: "index-failed" });
      } finally {
        loadingIndex = undefined;
      }
    })();
  }

  /** Show the dialog, cancelling an in-flight close if there is one. */
  function showDialog(): void {
    dialogAnimation?.cancel();
    dialogAnimation = undefined;
    searchDialog.classList.remove("closing");
    if (!searchDialog.open) searchDialog.showModal();
    if (!reducedMotion()) {
      dialogAnimation = searchDialog.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 160,
        easing: "ease-out",
      });
    }
  }

  function hideDialog(): void {
    if (reducedMotion()) {
      machine.send({ type: "closed" });
      return;
    }
    searchDialog.classList.add("closing");
    dialogAnimation = searchDialog.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 120,
      easing: "ease-in",
      fill: "forwards",
    });
    dialogAnimation.onfinish = () => {
      // A reopen cancels the animation and changes state; a late finish must
      // not close the dialog the reader has just brought back.
      if (machine.state.phase === "closing") machine.send({ type: "closed" });
    };
  }

  function updateSelection(state: SearchState): void {
    const items = searchResults.querySelectorAll<HTMLElement>("[data-index]");
    items.forEach((item, index) => {
      item.setAttribute("aria-selected", String(index === state.selected));
    });
    if (state.selected >= 0) items[state.selected]?.scrollIntoView({ block: "nearest" });
  }

  function renderResults(state: SearchState): void {
    if (state.phase === "loading") {
      searchStatus.textContent = t("loadingSearch");
      clearResults();
      return;
    }
    if (state.phase === "error") {
      searchStatus.textContent = t("searchFailed");
      clearResults();
      return;
    }
    // Keep the closing frame's contents on screen: it is the fade-out.
    if (state.phase !== "open") return;

    if (!state.query.trim()) {
      searchStatus.textContent = t("typeToSearch");
      clearResults();
      return;
    }

    const ranked = search(documents ?? [], state.query);
    if (ranked.length === 0) {
      searchStatus.textContent = t("noResults");
      clearResults();
      return;
    }

    searchStatus.textContent = t("resultCount", { count: ranked.length });
    searchStatus.classList.add("hidden");
    searchResults.replaceChildren(
      ...ranked.slice(0, MAX_RESULTS).map((hit, index) =>
        createResultItem({
          index,
          url: hit.heading ? `${hit.document.url}#${hit.heading.id}` : hit.document.url,
          title: hit.heading ? `${hit.document.title} › ${hit.heading.text}` : hit.document.title,
          excerpt: snippet(hit.document.text, state.query),
          trail: hit.document.trail ?? [],
          query: state.query,
        }),
      ),
    );
    searchResults.classList.add("active");
  }

  /**
   * Apply a state transition to the DOM. This is the only place that reads
   * `dialog.open`, the `closing` class or `input.disabled`: the rest of the
   * controller asks the machine what the dialog is doing.
   */
  function sync(state: SearchState, previous: SearchState, event: SearchEvent): void {
    if (state.index === "loading" && previous.index !== "loading") loadIndex();

    switch (state.phase) {
      case "loading":
      case "error":
      case "open":
        // Only the first visible transition shows (and animates) the dialog;
        // queries and selection changes must not restart its entrance.
        if (previous.phase === "closed" || previous.phase === "closing") showDialog();
        break;
      case "closing":
        if (previous.phase !== "closing") hideDialog();
        break;
      case "closed":
        dialogAnimation?.cancel();
        dialogAnimation = undefined;
        searchDialog.classList.remove("closing");
        if (searchDialog.open) searchDialog.close();
        if (searchInput.value) searchInput.value = "";
        searchInput.blur();
        clearResults();
        break;
    }

    const ready = state.phase === "open";
    searchInput.disabled = !ready;
    if (ready) {
      searchInput.placeholder = t("searchPlaceholder");
      if (event.type === "open" || event.type === "index-loaded") searchInput.focus();
    }

    if (
      state.phase !== previous.phase ||
      state.index !== previous.index ||
      state.query !== previous.query ||
      state.matches !== previous.matches
    )
      renderResults(state);
    if (state.phase === "open") updateSelection(state);
  }

  machine.subscribe(sync);

  function close(): void {
    machine.send({ type: "close" });
  }

  function follow(): void {
    const state = machine.state;
    const items = searchResults.querySelectorAll<HTMLElement>("[data-index]");
    if (state.selected >= 0 && state.selected < items.length) {
      const link = items[state.selected]!.querySelector<HTMLAnchorElement>("a");
      if (link) {
        location.href = link.href;
        close();
      }
    }
  }

  /** Compute what the machine needs to know when the query or index changed. */
  function updateQuery(value: string): void {
    const matches = documents ? Math.min(search(documents, value).length, MAX_RESULTS) : 0;
    machine.send({ type: "query", query: value, matches });
  }

  // Open via any search trigger.
  document.addEventListener("click", (event) => {
    const trigger = (event.target as Element | null)?.closest("[data-search-trigger]");
    if (!trigger) return;
    event.preventDefault();
    machine.send({ type: "open" });
  });

  // Nothing is intercepted: the anchor carries the query and the page reads it.
  // A modified click opens its tab or window, so the dialog stays put.
  searchResults.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if ((event.target as Element | null)?.closest(".docs-search-result")) close();
  });

  searchDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      machine.send({ type: "next" });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      machine.send({ type: "previous" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // A failed index load is retryable without closing: Enter retries.
      if (machine.state.phase === "error") machine.send({ type: "open" });
      else follow();
    }
  });

  // Close when clicking outside (on the backdrop).
  searchDialog.addEventListener("click", (event) => {
    if (event.target === searchDialog) close();
  });

  searchDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });

  searchDialog.addEventListener("close", () => {
    machine.send({ type: "closed" });
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => updateQuery(searchInput.value), 150);
  });

  searchResults.addEventListener("mouseover", (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>("[data-index]");
    if (!item) return;
    const index = Number(item.dataset["index"]);
    if (!Number.isNaN(index)) machine.send({ type: "select", index });
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      machine.send({ type: "open" });
    }
  });
});

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
  trail: string[];
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

  const trail = document.createElement("span");
  trail.className = "docs-search-result-trail";
  data.trail.forEach((label, i) => {
    if (i > 0) {
      const separator = document.createElement("span");
      separator.setAttribute("aria-hidden", "true");
      separator.textContent = " › ";
      trail.append(separator);
    }
    trail.append(label);
  });

  const excerpt = document.createElement("span");
  excerpt.className = "docs-search-result-excerpt";
  appendSegments(excerpt, data.excerpt);

  link.append(...(data.trail.length > 0 ? [trail] : []), title, excerpt);
  item.append(link);
  return item;
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
  for (const match of matches) {
    const last = merged[merged.length - 1];
    if (last && match.start < last.end) {
      last.end = Math.max(last.end, match.end);
    } else {
      merged.push({ ...match });
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
  for (const segment of segments) {
    if (segment.marked) {
      const mark = document.createElement("mark");
      mark.textContent = segment.text;
      target.append(mark);
    } else if (segment.text) {
      target.append(document.createTextNode(segment.text));
    }
  }
}
