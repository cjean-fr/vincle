import { VNode } from "./jsx-runtime.js";
import { buildAttrs } from "./attrs.js";
import { RawString } from "./raw.js";
import { escapeHtml, escapeRawTagContent, RAWTEXT_TAGS } from "./escape.js";
import { serializeElement } from "./serialize.js";

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

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof value === "object" && Symbol.asyncIterator in value;
}

function renderToStringAsync(node: unknown): string | Promise<string> {
  return createElementAsync(node);
}

function createElementAsync(
  vnode: unknown,
  rawtextTag?: string,
): string | Promise<string> {
  // ── Sync fast path (same as create-element.ts) ──
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string") {
    return rawtextTag ? escapeRawTagContent(vnode, rawtextTag) : escapeHtml(vnode);
  }
  if (typeof vnode === "number" || typeof vnode === "bigint") return String(vnode);
  if (vnode instanceof RawString) return vnode.value;

  // ── Async primitives ──
  if (vnode instanceof Promise) {
    return vnode.then((resolved) => createElementAsync(resolved, rawtextTag));
  }
  if (isAsyncIterable(vnode)) {
    return collectAsyncIterable(vnode, rawtextTag);
  }

  if (Array.isArray(vnode)) return renderChildrenAsync(vnode, rawtextTag);
  if (!(vnode instanceof VNode)) return escapeHtml(String(vnode));

  // ── Component ──
  if (typeof vnode.tag === "function") {
    let result: unknown;
    try {
      result = vnode.tag(vnode.attrs);
    } catch (e) {
      return Promise.reject(e);
    }
    if (result instanceof Promise) {
      return result.then((r) => createElementAsync(r, rawtextTag));
    }
    if (isAsyncIterable(result)) {
      return collectAsyncIterable(result, rawtextTag);
    }
    return createElementAsync(result, rawtextTag);
  }

  // ── Regular element ──
  const { tag, attrs, children } = vnode;

  if (!isValidTag(tag)) {
    throw new TypeError(
      `[core-next] Invalid tag name ${JSON.stringify(tag)}: a tag name must not be empty, ` +
        'start with "!" or "?", or contain whitespace, control characters, or any of " \' < > / = ` \\.',
    );
  }

  if (tag === "Fragment") {
    return children !== undefined ? renderChildrenAsync(children, rawtextTag) : "";
  }

  const attrStr = buildAttrs(attrs);
  const childTag = RAWTEXT_TAGS.has(tag) ? tag : rawtextTag;

  if (children !== undefined) {
    const content = renderChildrenAsync(children, childTag);
    if (content instanceof Promise) {
      return content.then((c) => serializeElement(tag, attrStr, c, true));
    }
    return serializeElement(tag, attrStr, content, true);
  }
  return serializeElement(tag, attrStr, "", false);
}

function renderChildrenAsync(
  children: unknown,
  rawtextTag?: string,
): string | Promise<string> {
  if (!Array.isArray(children)) {
    return createElementAsync(children, rawtextTag);
  }
  if (children.length === 0) return "";

  // Fast sync path — no Promise/async-iterable in sight
  let needsAsync = false;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child instanceof Promise || isAsyncIterable(child)) {
      needsAsync = true;
      break;
    }
  }

  if (!needsAsync) {
    let out = "";
    for (let i = 0; i < children.length; i++) {
      out += createElementAsync(children[i]!, rawtextTag);
    }
    return out;
  }

  // At least one async child — resolve all in parallel
  return Promise.all(children.map((child) => createElementAsync(child, rawtextTag))).then(
    (parts) => parts.join(""),
  );
}

async function collectAsyncIterable(
  iterable: AsyncIterable<unknown>,
  rawtextTag?: string,
): Promise<string> {
  let out = "";
  for await (const chunk of iterable) {
    const rendered = createElementAsync(chunk, rawtextTag);
    out += rendered instanceof Promise ? await rendered : rendered;
  }
  return out;
}

export { renderToStringAsync };
