/**
 * Landing on a search result: scroll to the words that matched.
 *
 * The dialog puts the query in the fragment of the result it links to; this
 * module reads it on arrival, lights the words in the prose and erases the
 * fragment so the address bar is left clean.
 *
 * The painting is the browser's — a `Range` registered as a custom highlight,
 * so the text is never touched: no node split, no wrapper, and nothing left
 * behind once the highlight is dropped. Only the walk is ours, because it has
 * to stay inside the prose. The standard `#:~:text=` cannot: the browser
 * strips that directive before scripts see it, and it would match the sidebar
 * anyway — the nav comes before the article and lists the same titles.
 */

/** Chrome, controls and hidden text are not what a reader came looking for. */
const SKIPPED = "script, style, kbd, button, .docs-heading-anchor, .sr-only, [aria-hidden='true']";
const HIGHLIGHT_NAME = "docs-search-hit";
/** Longest the landing mark survives on its own, for a reader who walks away. */
const CLEAR_MS = 10_000;

/**
 * The query the dialog left in the fragment, spent as it is read.
 *
 * A heading anchor parses as an empty parameter bag, so anything that is not
 * ours leaves the address bar alone.
 */
function takeQueryFromFragment(): string | null {
  const query = new URLSearchParams(location.hash.slice(1)).get("q")?.trim();
  if (!query) return null;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  return query;
}

/** Scroll the first occurrence of `query` into view, inside the prose. */
function reveal(query: string): void {
  if (!("highlights" in CSS)) return;

  const ranges = findRanges(query);
  if (ranges.length === 0) return;

  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  scrollTo(ranges[0]!);

  // The mark belongs to a landing, not to the page: the next gesture takes it
  // away, and a reader who never gestures does not keep it forever either.
  const dismiss = (): void => {
    window.removeEventListener("pointerdown", dismiss, true);
    window.removeEventListener("keydown", dismiss, true);
    CSS.highlights.delete(HIGHLIGHT_NAME);
  };
  window.addEventListener("pointerdown", dismiss, { once: true, capture: true });
  window.addEventListener("keydown", dismiss, { once: true, capture: true });
  window.setTimeout(dismiss, CLEAR_MS);
}

/**
 * The first occurrence of each term, as ranges, in reading order.
 *
 * Every term gets its own range, so a query whose words sit in different
 * paragraphs lights them all up and lands on the earliest. A term is looked
 * for inside a single text node: a phrase broken by inline markup is then found
 * through its first word, which lands on the right paragraph all the same.
 */
function findRanges(query: string): Range[] {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))];
  const main = document.getElementById("docs-main");
  if (!main || terms.length === 0) return [];

  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest(SKIPPED)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });

  const ranges: Range[] = [];
  const found = new Set<string>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const lower = text.data.toLowerCase();
    const here: { at: number; end: number }[] = [];
    for (const term of terms) {
      if (found.has(term)) continue;
      const at = lower.indexOf(term.toLowerCase());
      if (at < 0) continue;
      found.add(term);
      here.push({ at, end: at + term.length });
    }
    // Document order: the walker has already walked forward, so only the terms
    // sharing a text node need sorting.
    for (const { at, end } of here.toSorted((a, b) => a.at - b.at)) {
      const range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, end);
      ranges.push(range);
    }
    if (found.size === terms.length) break;
  }
  return ranges;
}

/**
 * Brings the passage to eye level: a third from the top, which clears the fixed
 * header whatever its height, and leaves the prose above it for context. A
 * match already sitting in that band is left alone — no jump, no flash.
 */
function scrollTo(range: Range): void {
  const rect = range.getBoundingClientRect();
  if (rect.height === 0) return; // collapsed or off-document: nothing to show
  if (rect.top > window.innerHeight * 0.15 && rect.bottom < window.innerHeight * 0.85) return;
  window.scrollTo({
    top: rect.top + window.scrollY - window.innerHeight * 0.35,
    // `instant`, not `auto`: `auto` defers to the root's `scroll-behavior:
    // smooth`, and the reader would have to watch the landing travel.
    behavior: "instant",
  });
}

/** A landing, on arrival or without leaving the page. */
function revealFromFragment(): void {
  const query = takeQueryFromFragment();
  if (query) reveal(query);
}

document.addEventListener("DOMContentLoaded", revealFromFragment);
// The same page, a second search: the fragment is all that changes.
window.addEventListener("hashchange", revealFromFragment);
