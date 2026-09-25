import {
  URL_ATTRIBUTES,
  ANIMATED_URL_ATTRIBUTES,
  isRawtextTag,
  isAnimationTag,
  resolveAttrName,
  escapeContent,
  escapeAttr,
  escapeRawTagContent,
  isValidAttrName,
  attrMeta,
} from "@vincle/core/html";
import { decodeHTMLStrict } from "entities";

// One source of truth for what closes nothing: the transform and the runtime
// ask the same question, answered once in `@vincle/core`.
export { isVoidElement } from "@vincle/core/html";

export {
  URL_ATTRIBUTES,
  ANIMATED_URL_ATTRIBUTES,
  isRawtextTag,
  isAnimationTag,
  resolveAttrName,
  escapeContent,
  escapeAttr,
  escapeRawTagContent,
  isValidAttrName,
  attrMeta,
};

export const RUNTIME_SOURCE = "@vincle/core/jsx-runtime";

/**
 * Decode the HTML entities in a JSX text node the way the JS compilers do
 * (Babel/TS/esbuild/Bun), so precompiled static text matches the string the
 * runtime path receives. Uses strict (semicolon-required) decoding: named
 * references need a trailing `;`, unknown references (`&notreal;`) are left
 * verbatim: verified byte-identical to Bun's JSX transform.
 *
 * Only for **non-rawtext** content: inside `<script>`/`<style>` the HTML
 * parser never decodes entities, and Deno's precompile keeps them literal, so
 * rawtext text must be emitted verbatim (see `isRawtextTag`).
 */
export function decodeJsxEntities(text: string): string {
  return decodeHTMLStrict(text);
}

export function isLowercaseTag(name: string): boolean {
  return (
    name[0] !== undefined && name[0] === name[0].toLowerCase() && name[0] !== name[0].toUpperCase()
  );
}

/**
 * Collapse the whitespace of a JSX text child the way the JSX compilers
 * (Bun/TS/esbuild/SWC/oxc) do, so precompiled output matches what the runtime
 * path would render:
 *   - lines are split on newlines;
 *   - leading whitespace is stripped from every line but the first;
 *   - trailing whitespace is stripped from every line but the last;
 *   - blank lines are dropped, non-blank lines are joined with a single space;
 *   - a tab counts as whitespace for those trims, and is kept where it
 *     survives them, visibly inside `<pre>`. Babel alone turns it into a
 *     space; the compilers above keep it.
 * A text node that is entirely whitespace spanning a newline collapses to "".
 */
export function collapseJsxWhitespace(text: string): string {
  const lines = text.split(/\r\n|\n|\r/);

  let lastNonEmptyLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i] ?? "")) lastNonEmptyLine = i;
  }

  let out = "";
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? "";
    if (i !== 0) line = line.replace(/^[ \t]+/, "");
    if (i !== lines.length - 1) line = line.replace(/[ \t]+$/, "");
    if (line) {
      if (i !== lastNonEmptyLine) line += " ";
      out += line;
    }
  }
  return out;
}

export interface AttrBrief {
  kind: "attribute" | "spread";
  name?: string;
}

export function hasSpreadOrInnerHTML(attrs: Iterable<AttrBrief>): boolean {
  for (const a of attrs) {
    if (a.kind === "spread") return true;
    if (a.name === "dangerouslySetInnerHTML") return true;
  }
  return false;
}

/**
 * Does this element have to be left to the runtime?
 *
 * An animation writing a value: `<animate attributeName="href" values="…">`.
 * Two attributes decide what its values mean, and inlining emits them one
 * attribute at a time — `jsxAttr("values", …)` has no tag to judge against, and
 * that is not a parameter this transform may add: the two-argument form is the
 * contract every precompile transform is written against, Deno's included. The
 * tag *is* known here, so the way to deliver it to the decision is to hand the
 * element back as ordinary JSX. `buildAttrs` then sees the tag, the bag and the
 * sibling, and is the only place in the runtime that holds all three.
 *
 * Declined whether `attributeName` is a literal or not: a computed target is
 * exactly the case the runtime cannot take on trust either, and it judges it as
 * a URL for that reason. `attrMeta` staying a name-only answer is what makes
 * this necessary — the same split `animationWritesUrls` documents.
 */
export function animationNeedsRuntime(tag: string, attrs: Iterable<AttrBrief>): boolean {
  if (!isAnimationTag(tag)) return false;
  let hasTarget = false;
  let hasValue = false;
  for (const a of attrs) {
    if (a.kind !== "attribute" || a.name === undefined) continue;
    // Resolved, as the runtime judges them: `VALUES` is `values`, and
    // `attributename` is the `attributeName` the parser adjusts it to.
    const name = attrMeta(a.name).name;
    if (ANIMATED_URL_ATTRIBUTES.has(name)) hasValue = true;
    else if (name.toLowerCase() === "attributename") hasTarget = true;
  }
  // No value to write is an animation of nothing, which is also what
  // `animationWritesUrls` answers on the runtime side: the two must agree, or
  // the same element would be judged twice differently.
  return hasTarget && hasValue;
}

/**
 * Rewrite a JSX attribute name to its HTML form (`className` → `class`, …).
 * Names not in the map are returned unchanged. The transform applies this at
 * build time so static attributes stay inlined: same as Deno's precompile.
 */
export function remapAttrName(name: string): string {
  return resolveAttrName(name);
}
