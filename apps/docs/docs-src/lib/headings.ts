/**
 * What "a heading carrying an id" means, defined once.
 *
 * Two passes read headings from the rendered HTML — the table of contents and
 * the permalinks — and each used to carry its own expression. They diverged
 * on a heading split across several lines: the permalink pass caught it, the
 * TOC pass didn't. None of the site's 195 occurrences hit it, but nothing
 * ruled it out.
 */
const HEADING_RE = /<h([1-6])\s+id="([^"]+)"([^>]*)>([\s\S]*?)<\/h\1>/gi;

export interface Heading {
  level: number;
  id: string;
  /** The attributes after the id, verbatim. */
  attrs: string;
  /** The heading's content, HTML included. */
  inner: string;
}

/** Replaces each id-carrying heading with what `render` makes of it. */
export function replaceHeadings(html: string, render: (h: Heading) => string): string {
  return html.replace(HEADING_RE, (_m, level: string, id: string, attrs: string, inner: string) =>
    render({ level: Number(level), id, attrs, inner }),
  );
}

/** The id-carrying headings, in document order. */
export function eachHeading(html: string): Heading[] {
  const out: Heading[] = [];
  replaceHeadings(html, (h) => {
    out.push(h);
    return "";
  });
  return out;
}

/** The permalink's class — the table of contents must be able to ignore it. */
export const ANCHOR_CLASS = "docs-heading-anchor";

const ANCHOR_RE = new RegExp(`<a class="${ANCHOR_CLASS}"[\\s\\S]*?</a>`, "gi");

/**
 * A heading's label, stripped of its permalink.
 *
 * This is what makes the two passes commute: the table of contents could get
 * polluted by the "#" permalinks add, and the order of the transform array
 * was the only thing preventing it — in a comment.
 */
export const withoutAnchor = (inner: string): string => inner.replace(ANCHOR_RE, "");
