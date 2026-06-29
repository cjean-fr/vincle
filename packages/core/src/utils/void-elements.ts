/**
 * HTML5 Void Elements
 * These elements cannot have children and do not require a closing slash in HTML5.
 * https://html.spec.whatwg.org/multipage/syntax.html#void-elements
 */
export const VOID_ELEMENTS: Set<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
