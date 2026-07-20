import { VNode } from "./jsx-runtime.js";
import { buildAttrs } from "./attrs.js";
import { RawString } from "./raw.js";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const RAWTEXT = new Set([
  "script", "style", "xmp", "iframe", "noembed", "noframes",
]);

const RE_INVALID_TAG = /^[!?]|[\s"'<>/=`\\]|\p{C}/u;
const MAX_TAG_CACHE = 1000;
const TAG_INFO = new Map<string, TagInfo>();

interface TagInfo {
  valid: boolean;
  rawtext: string | undefined;
  isVoid: boolean;
}

function tagInfo(tag: string): TagInfo {
  let info = TAG_INFO.get(tag);
  if (info === undefined) {
    const valid = tag.length > 0 && !RE_INVALID_TAG.test(tag);
    const lc = tag.toLowerCase();
    info = {
      valid,
      rawtext: valid && RAWTEXT.has(lc) ? lc : undefined,
      isVoid: valid && VOID.has(tag),
    };
    if (TAG_INFO.size >= MAX_TAG_CACHE) TAG_INFO.clear();
    TAG_INFO.set(tag, info);
  }
  return info;
}

function renderToString(node: unknown): string {
  return createElement(node);
}

function createElement(vnode: unknown): string {
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string" || typeof vnode === "number") return escapeHtml(String(vnode));
  if (vnode instanceof RawString) return vnode.value;
  if (!(vnode instanceof VNode)) return escapeHtml(String(vnode));

  if (typeof vnode.tag === "function") {
    return createElement(vnode.tag(vnode.attrs));
  }

  const { tag, attrs, children } = vnode;

  if (tag === "Fragment") {
    return renderChildren(children);
  }

  const attrStr = buildAttrs(attrs);

  const innerHTML = attrs.dangerouslySetInnerHTML as { __html: unknown } | undefined;
  if (innerHTML !== undefined) {
    const content = innerHTML.__html == null ? "" : String(innerHTML.__html);
    return `<${tag}${attrStr}>${content}</${tag}>`;
  }

  if (RAWTEXT.has(tag)) {
    const content = children !== undefined ? renderChildren(children) : "";
    return `<${tag}${attrStr}>${escapeRawTagContent(content, tag)}</${tag}>`;
  }

  if (!children && VOID.has(tag)) {
    return `<${tag}${attrStr}/>`;
  }

  const content = children !== undefined ? renderChildren(children) : "";
  return `<${tag}${attrStr}>${content}</${tag}>`;
}

function renderChildren(children: unknown): string {
  if (!Array.isArray(children)) {
    if (typeof children === "string") return escapeHtml(children);
    if (typeof children === "number") return escapeHtml(String(children));
    if (children == null || children === true || children === false) return "";
    return createElement(children);
  }
  let out = "";
  for (let i = 0; i < children.length; i++) {
    out += createElement(children[i]!);
  }
  return out;
}

function escapeHtml(str: string): string {
  let out = "", start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 38)      { out += str.slice(start, i) + "&amp;";  start = i + 1; }
    else if (c === 60) { out += str.slice(start, i) + "&lt;";  start = i + 1; }
    else if (c === 62) { out += str.slice(start, i) + "&gt;";  start = i + 1; }
  }
  return start === 0 ? str : out + str.slice(start);
}

const RAWTEXT_RE = new Map<string, RegExp>();
for (const tag of RAWTEXT) {
  RAWTEXT_RE.set(tag, new RegExp("</" + tag, "i"));
}

function escapeRawTagContent(str: string, tag: string): string {
  if (!RAWTEXT.has(tag)) return str;
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
