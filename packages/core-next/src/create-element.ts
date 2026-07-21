import { VNode } from "./jsx-runtime.js";
import { buildAttrs } from "./attrs.js";
import { RawString } from "./raw.js";
import { escapeHtml, escapeRawTagContent, RAWTEXT_TAGS } from "./escape.js";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const RE_INVALID_TAG = /^[!?]|[\s"'<>/=`\\]|\p{C}/u;

const TAG_VALID_CACHE = new Map<string, boolean>();

function isValidTag(tag: string): boolean {
  let valid = TAG_VALID_CACHE.get(tag);
  if (valid === undefined) {
    valid = tag.length > 0 && !RE_INVALID_TAG.test(tag);
    TAG_VALID_CACHE.set(tag, valid);
  }
  return valid;
}

function renderToString(node: unknown): string {
  return createElement(node);
}

function createElement(vnode: unknown, rawtextTag?: string): string {
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string") {
    return rawtextTag ? escapeRawTagContent(vnode, rawtextTag) : escapeHtml(vnode);
  }
  if (typeof vnode === "number") return String(vnode);
  if (vnode instanceof RawString) return vnode.value;
  if (!(vnode instanceof VNode)) return escapeHtml(String(vnode));

  if (typeof vnode.tag === "function") {
    return createElement(vnode.tag(vnode.attrs), rawtextTag);
  }

  const { tag, attrs, children } = vnode;

  if (!isValidTag(tag)) {
    throw new TypeError(
      `[core-next] Invalid tag name ${JSON.stringify(tag)}: a tag name must not be empty, ` +
        'start with "!" or "?", or contain whitespace, control characters, or any of " \' < > / = ` \\.',
    );
  }

  if (tag === "Fragment") {
    return renderChildren(children, rawtextTag);
  }

  const attrStr = buildAttrs(attrs);

  if (RAWTEXT_TAGS.has(tag)) {
    const content = children !== undefined ? renderChildren(children, tag) : "";
    return `<${tag}${attrStr}>${content}</${tag}>`;
  }

  if (!children && VOID.has(tag)) {
    return `<${tag}${attrStr}/>`;
  }

  const content = children !== undefined ? renderChildren(children, rawtextTag) : "";
  return `<${tag}${attrStr}>${content}</${tag}>`;
}

function renderChildren(children: unknown, rawtextTag?: string): string {
  if (!Array.isArray(children)) {
    if (typeof children === "string") {
      return rawtextTag ? escapeRawTagContent(children, rawtextTag) : escapeHtml(children);
    }
    if (typeof children === "number") return String(children);
    if (children == null || children === true || children === false) return "";
    return createElement(children, rawtextTag);
  }
  let out = "";
  for (let i = 0; i < children.length; i++) {
    out += createElement(children[i]!, rawtextTag);
  }
  return out;
}

export { renderToString };
