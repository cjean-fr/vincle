/**
 * Pre-render a static element subtree to a RawString.
 * Called from jsx() when the element is known to be fully static
 * (no components, no style objects, no promises, no VNode children).
 */
import { RawString } from "./raw.js";
import { buildAttrs } from "./attrs.js";
import { escapeHtml, escapeRawTagContent, RAWTEXT_TAGS } from "./escape.js";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

export function renderStatic(
  tag: string,
  attrs: Record<string, unknown>,
  children: unknown,
): RawString {
  const attrStr = buildAttrs(attrs);

  if (RAWTEXT_TAGS.has(tag)) {
    const content = children !== undefined ? renderFlatChildren(children, tag) : "";
    return new RawString(`<${tag}${attrStr}>${content}</${tag}>`);
  }

  if (!children && VOID.has(tag)) {
    return new RawString(`<${tag}${attrStr}>`);
  }

  const content = children !== undefined ? renderFlatChildren(children) : "";
  return new RawString(`<${tag}${attrStr}>${content}</${tag}>`);
}

function renderFlatChildren(children: unknown, rawtextTag?: string): string {
  if (!Array.isArray(children)) return renderFlatChild(children, rawtextTag);
  let out = "";
  for (let i = 0; i < children.length; i++) {
    out += renderFlatChild(children[i], rawtextTag);
  }
  return out;
}

function renderFlatChild(child: unknown, rawtextTag?: string): string {
  if (child == null || typeof child === "boolean") return "";
  if (typeof child === "string") {
    return rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeHtml(child);
  }
  if (typeof child === "number") return String(child);
  if (child instanceof RawString) return child.value;
  // Shouldn't reach here for truly static trees — children are
  // string/number/null/RawString only. Be safe:
  return escapeHtml(String(child));
}
