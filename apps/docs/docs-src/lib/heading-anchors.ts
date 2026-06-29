const HEADING_RE = /<h([2-4])\s+id="([^"]+)"([^>]*)>([\s\S]*?)<\/h\1>/gi;

/**
 * Post-render transform: append a hover-revealed "#" permalink to every
 * h2–h4 that carries an id. Must run AFTER injectToc — the anchor adds a
 * text node ("#") inside the heading that would otherwise leak into the
 * extracted TOC labels.
 */
export function injectHeadingAnchors(html: string): string {
  return html.replace(
    HEADING_RE,
    (_m, level: string, id: string, attrs: string, inner: string) =>
      `<h${level} id="${id}"${attrs}>${inner}<a class="docs-heading-anchor" href="#${id}" aria-label="Direct link to this section">#</a></h${level}>`,
  );
}
