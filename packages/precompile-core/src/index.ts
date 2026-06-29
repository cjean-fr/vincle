import {
  VOID_ELEMENTS,
  URL_ATTRIBUTES,
  RAWTEXT_TAGS,
  ATTRIBUTE_NAME_MAP,
  escapeAttr,
  isValidAttrName,
} from "@vincle/core/html";

export {
  VOID_ELEMENTS,
  URL_ATTRIBUTES,
  RAWTEXT_TAGS,
  ATTRIBUTE_NAME_MAP,
  escapeAttr,
  isValidAttrName,
};

export const RUNTIME_SOURCE = "@vincle/core/jsx-runtime";

export function isLower(s: string): boolean {
  return (
    s[0] !== undefined &&
    s[0] === s[0].toLowerCase() &&
    s[0] !== s[0].toUpperCase()
  );
}

export function isLowercaseTag(name: string): boolean {
  return isLower(name);
}

// A bare `&` is one that does not open a well-formed numeric or named entity.
const REGEX_BARE_AMP = /&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g;

/**
 * HTML-escape a static JSX text child so precompiled output is valid HTML that
 * renders identically to the runtime path (which escapes `& < >` via
 * `escapeContent`). Bare `&`, `<`, and `>` are escaped; already well-formed
 * entities (`&amp;`, `&#65;`, `&eacute;`) are left intact rather than
 * double-escaped.
 *
 * Note: unlike the standard JSX transform (which decodes entities to their
 * characters before the runtime re-escapes), entities are preserved verbatim.
 * The bytes differ for non-predefined entities but the parsed DOM is identical,
 * so this avoids shipping a full HTML entity table.
 */
export function escapeJsxText(text: string): string {
  return text
    .replace(REGEX_BARE_AMP, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Collapse the whitespace of a JSX text child the way the standard JSX
 * transform (Babel/TS/esbuild) does, so precompiled output matches what the
 * runtime path would render:
 *   - lines are split on newlines;
 *   - leading whitespace is stripped from every line but the first;
 *   - trailing whitespace is stripped from every line but the last;
 *   - blank lines are dropped, non-blank lines are joined with a single space;
 *   - tabs are treated as spaces.
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
    let line = (lines[i] ?? "").replace(/\t/g, " ");
    if (i !== 0) line = line.replace(/^ +/, "");
    if (i !== lines.length - 1) line = line.replace(/ +$/, "");
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

export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag);
}

/**
 * True for attribute names whose value the runtime sanitizes for unsafe URL
 * schemes. The transform routes static literal values of these attributes
 * through `jsxAttr` so the same check applies at runtime instead of inlining
 * a potentially unsafe URL verbatim.
 */
export function isUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTES.has(name.toLowerCase());
}

/**
 * Rewrite a JSX attribute name to its HTML form (`className` → `class`, …).
 * Names not in the map are returned unchanged. The transform applies this at
 * build time so static attributes stay inlined — same as Deno's precompile.
 */
export function remapAttrName(name: string): string {
  return ATTRIBUTE_NAME_MAP.get(name) ?? name;
}

const REGEX_EVENT_HANDLER = /^on[a-z]/i;

/** True for `on*` event-handler attribute names (e.g. `onClick`, `onclick`). */
export function isEventHandlerName(name: string): boolean {
  return REGEX_EVENT_HANDLER.test(name);
}
