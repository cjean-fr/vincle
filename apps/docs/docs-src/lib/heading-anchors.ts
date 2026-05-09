import { ANCHOR_CLASS, replaceHeadings } from "./headings.js";

/** A permalink revealed on hover, on every id-carrying h2–h4. */
export function injectHeadingAnchors(html: string): string {
  return replaceHeadings(html, ({ level, id, attrs, inner }) =>
    level >= 2 && level <= 4
      ? `<h${level} id="${id}"${attrs}>${inner}<a class="${ANCHOR_CLASS}" href="#${id}" aria-label="Direct link to this section">#</a></h${level}>`
      : `<h${level} id="${id}"${attrs}>${inner}</h${level}>`,
  );
}
