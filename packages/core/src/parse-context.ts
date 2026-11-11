/**
 * Parser context: where the HTML parser stands while the walk emits bytes.
 *
 * The one escaping decision that depends on it is rawtext: `<script>` and
 * `<style>` hold raw text in the HTML namespace, but ordinary markup in
 * foreign content (`<svg>`, `<math>`), where a `<` opens a tag. That decision
 * must be taken where the text is escaped, with the namespace known there —
 * not guessed from the tag name alone, and not repaired on the finished
 * document.
 *
 * The context is a persistent stack, one cell per namespace transition,
 * linked to its parent. Recursion gives the walk its stack discipline: an
 * element hands its children the pushed cell and the caller's cell is
 * untouched when it returns. Text that is already markup — `raw()`, template
 * fragments — can open or close a namespace itself, so a sequential walk
 * scans it and lets the cell it ends on flow to the next sibling.
 *
 * @module
 */

export type Namespace = "html" | "svg" | "math";

/**
 * One namespace transition: the namespace entered, the tag that caused it
 * (lowercased), and the context it was entered from.
 */
export interface ParseContext {
  readonly ns: Namespace;
  readonly tag: string;
  readonly parent: ParseContext | null;
}

/** The context every render starts in. */
export const HTML_CONTEXT: ParseContext = { ns: "html", tag: "", parent: null };

/**
 * A cell is pushed for exactly these elements. Every other element keeps its
 * parent's namespace, so no context allocation happens for a `<div>` — the
 * ordinary element pays nothing for this module.
 */
const TRANSITIONS = new Set([
  "svg",
  "math",
  "foreignobject",
  "desc",
  "title",
  "mi",
  "mo",
  "mn",
  "ms",
  "mtext",
  "annotation-xml",
]);

// HTML integration points: the elements under which the parser is back in the
// HTML namespace. `annotation-xml` is one only when it declares an HTML
// encoding.
// @see https://html.spec.whatwg.org/multipage/parsing.html#parsing-main-inforeign
const SVG_INTEGRATION = new Set(["foreignobject", "desc", "title"]);
const MATHML_INTEGRATION = new Set(["mi", "mo", "mn", "ms", "mtext"]);

/**
 * The namespace of an element's children, given its own namespace.
 *
 * The element is handed its attributes because `annotation-xml` is an
 * integration point only for an HTML encoding.
 */
export function childNamespace(
  ns: Namespace,
  tag: string,
  attrs: Record<string, unknown>,
): Namespace {
  const lower = tag.toLowerCase();
  if (ns === "html") {
    if (lower === "svg") return "svg";
    if (lower === "math") return "math";
    return "html";
  }
  if (ns === "svg") return SVG_INTEGRATION.has(lower) ? "html" : "svg";
  if (MATHML_INTEGRATION.has(lower)) return "html";
  if (lower === "annotation-xml") {
    const encoding = attrs["encoding"];
    if (typeof encoding === "string" && encoding.toLowerCase() === "text/html") return "html";
  }
  return "math";
}

/**
 * The context for an element's children: a cell pushed when the element
 * transitions namespaces, the parent's context when it does not.
 *
 * A cell is also pushed when the tag is transitional without changing the
 * namespace (a nested `<svg>`), so a closing `</svg>` found in later markup
 * text pops this element and not its parent.
 */
export function childContext(
  ctx: ParseContext,
  tag: string,
  attrs: Record<string, unknown>,
): ParseContext {
  // Every transitional tag (and only those) starts with s, m, f, d, t or a:
  // gate on the first letter, case folded by bit, so the common `<div>` never
  // pays for toLowerCase. What passes the gate is checked in full.
  const first = tag.charCodeAt(0) | 32;
  if (
    first !== 115 /* s */ &&
    first !== 109 /* m */ &&
    first !== 102 /* f */ &&
    first !== 100 /* d */ &&
    first !== 116 /* t */ &&
    first !== 97 /* a */
  )
    return ctx;
  const lower = tag.toLowerCase();
  if (!TRANSITIONS.has(lower)) return ctx;
  const ns = childNamespace(ctx.ns, lower, attrs);
  // A nested `<svg>` or `<math>` changes no namespace but still gets a cell:
  // its closing tag in later markup text must pop it, not its parent. An
  // integration point without a transition (`<title>` in HTML) gets none.
  if (ns === ctx.ns && lower !== "svg" && lower !== "math") return ctx;
  return { ns, tag: lower, parent: ctx };
}

// ── Scanning text that is already markup ────────────────────────────────
//
// Template fragments and raw() strings arrive as final bytes. The context
// after them depends on what they open and close, so a sequential walk reads
// their transitional tags. The scan is quote- and comment-aware: `<g
// title="</svg>">` does not close anything, and `<!-- </svg> -->` is not a
// tag. Element names are case-insensitive.
//
// What it deliberately does not reproduce: the parser's exit from foreign
// content on an HTML tag (`<svg><div>` ends the SVG for a browser). The walk
// follows the JSX tree's structure, and recovering like a browser is not the
// library's contract.

/** Fast rejection: no interesting markup, no scan. Escaped text fails here too. */
const RE_MAYBE_TRANSITION =
  /<\/?(?:svg|math|foreignobject|desc|title|mi|mo|mn|ms|mtext|annotation-xml)(?=[\s/>])|<!--/i;

/** One tag or comment opener. */
const RE_TOKEN = /<!--|<(\/?)([a-zA-Z][^\s/>]*)/g;

const RE_ENCODING = /encoding\s*=\s*("([^"]*)"|'([^']*)')/i;

/** Read a start tag's raw attribute text: from its name to the closing `>`, quote-aware. */
function readTag(text: string, from: number): number {
  let quote = 0;
  for (let i = from; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (quote !== 0) {
      if (c === quote) quote = 0;
    } else if (c === 34 || c === 39) {
      quote = c;
    } else if (c === 62) {
      return i + 1;
    }
  }
  return text.length;
}

/**
 * The context after a close tag: the nearest cell this tag opened is popped
 * with everything above it. No matching cell, no change: a close for an
 * element the walk never opened is the caller's markup, not a transition.
 */
function closeTag(ctx: ParseContext, lower: string): ParseContext {
  let cursor: ParseContext | null = ctx;
  while (cursor !== null) {
    if (cursor.tag === lower) return cursor.parent ?? ctx;
    cursor = cursor.parent;
  }
  return ctx;
}

/**
 * The context after `text` was emitted starting in `ctx`.
 *
 * Only text that can carry real markup reaches the scan: the caller checks
 * `mayTransition` first, which escaped content never passes.
 */
export function scanTextContext(ctx: ParseContext, text: string): ParseContext {
  let current = ctx;
  RE_TOKEN.lastIndex = 0;
  for (let m = RE_TOKEN.exec(text); m !== null; m = RE_TOKEN.exec(text)) {
    if (m[0] === "<!--") {
      const end = text.indexOf("-->", RE_TOKEN.lastIndex);
      RE_TOKEN.lastIndex = end === -1 ? text.length : end + 3;
      continue;
    }
    const lower = m[2]!.toLowerCase();
    if (m[1] === "/") {
      if (TRANSITIONS.has(lower)) current = closeTag(current, lower);
      continue;
    }
    const end = readTag(text, RE_TOKEN.lastIndex);
    if (text.charCodeAt(end - 2) === 47) {
      RE_TOKEN.lastIndex = end; // self-closing: opens and closes itself
      continue;
    }
    if (TRANSITIONS.has(lower)) {
      let attrs: Record<string, unknown> = {};
      if (lower === "annotation-xml") {
        const enc = RE_ENCODING.exec(text.slice(m.index, end));
        if (enc !== null) attrs = { encoding: enc[2] ?? enc[3] ?? "" };
      }
      current = childContext(current, lower, attrs);
    }
    RE_TOKEN.lastIndex = end;
  }
  return current;
}

/** True when the text may change the parser context and deserves the scan. */
export function mayTransition(text: string): boolean {
  return text.indexOf("<") !== -1 && RE_MAYBE_TRANSITION.test(text);
}
