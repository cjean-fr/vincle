import { escapeAttr } from "@vincle/core/html";

import type { Locale } from "../i18n/locale.js";

import { translatorFor } from "../i18n/interface.js";
import { ANCHOR_CLASS, replaceHeadings } from "./headings.js";

/** A permalink revealed on hover, on every id-carrying h2–h4. */
export function injectHeadingAnchors(html: string, locale: Locale = "en"): string {
  const label = escapeAttr(translatorFor(locale)("sectionLink"));
  return replaceHeadings(html, ({ level, id, attrs, inner }) =>
    level >= 2 && level <= 4
      ? `<h${level} id="${id}"${attrs}>${inner}<a class="${ANCHOR_CLASS}" href="#${id}" aria-label="${label}">#</a></h${level}>`
      : `<h${level} id="${id}"${attrs}>${inner}</h${level}>`,
  );
}
