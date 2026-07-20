import { VNode } from "./jsx-runtime.js";
import { buildAttrs } from "./attrs.js";
import { RawString } from "./raw.js";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const RAWTEXT = new Set([
  "script", "style",
]);

const RE_INVALID_TAG = /^[!?]|[\s"'<>/=`\\]|\p{C}/u;

function isValidTag(tag: string): boolean {
  return tag.length > 0 && !RE_INVALID_TAG.test(tag);
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

  if (RAWTEXT.has(tag)) {
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

const RE_ESCAPE_HTML = /[&<>]/;

function escapeHtml(str: string): string {
  if (!RE_ESCAPE_HTML.test(str)) return str;
  let out = "", start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; } // &
    else if (c === 60) { out += str.slice(start, i) + "&lt;";  start = i + 1; } // <
    else if (c === 62) { out += str.slice(start, i) + "&gt;";  start = i + 1; } // >
  }
  return start === 0 ? str : out + str.slice(start);
}

const RAWTEXT_RE = new Map<string, RegExp>();
for (const tag of RAWTEXT) {
  RAWTEXT_RE.set(tag, new RegExp("</" + tag, "i"));
}

function escapeRawTagContent(str: string, tag: string): string {
  if (!RAWTEXT.has(tag)) return escapeHtml(str);
  const re = RAWTEXT_RE.get(tag)!;
  const m = re.exec(str);
  if (!m) return str;

  const tagLen = tag.length;
  const closeTagLow = `</${tag.toLowerCase()}`;
  const lower = str.toLowerCase();
  let out = "", last = 0;
  let idx = m.index;

  while (idx !== -1) {
    out += str.slice(last, idx) + `<\\${str.slice(idx + 1, idx + 2 + tagLen)}`;
    last = idx + 2 + tagLen;
    idx = lower.indexOf(closeTagLow, last);
  }

  return out + str.slice(last);
}

export { renderToString };
