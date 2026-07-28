import { buildAttrs } from "./attrs.js";
import { escapeContent, escapeRawTagContent, RAWTEXT_TAGS } from "./escape.js";
import { VNode } from "./jsx-runtime.js";
import { RawString } from "./raw.js";
import { serializeElement, isValidTag } from "./serialize.js";

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof value === "object" && Symbol.asyncIterator in value;
}

export function renderToString(node: unknown): Promise<string> {
  return Promise.resolve(renderNode(node));
}

/**
 * Parcours récursif du VNode tree (version async).
 * N'accepte PAS de rawtextTag — l'échappement spécifique à `<script>` / `<style>`
 * est géré localement dans renderChildrenAsync, pas hérité.
 */
function renderNode(vnode: unknown): string | Promise<string> {
  // ── Sync fast path ──
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string") return escapeContent(vnode);
  if (typeof vnode === "number" || typeof vnode === "bigint") return String(vnode);
  if (vnode instanceof RawString) return vnode.value;

  // ── Async primitives ──
  if (vnode instanceof Promise) {
    return vnode.then((resolved) => renderNode(resolved));
  }
  if (isAsyncIterable(vnode)) {
    return collectAsyncIterable(vnode);
  }

  if (Array.isArray(vnode)) return renderChildrenAsync(vnode);
  if (!(vnode instanceof VNode)) return escapeContent(String(vnode));

  // ── Component ──
  if (typeof vnode.tag === "function") {
    let result: unknown;
    try {
      result = vnode.tag(vnode.attrs);
    } catch (e) {
      return Promise.reject(e);
    }
    if (result instanceof Promise) {
      return result.then((r) => renderNode(r));
    }
    if (isAsyncIterable(result)) {
      return collectAsyncIterable(result);
    }
    return renderNode(result);
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
    return children !== undefined ? renderChildrenAsync(children) : "";
  }

  const attrStr = buildAttrs(attrs);
  const childTag = RAWTEXT_TAGS.has(tag) ? tag : undefined;

  if (children !== undefined) {
    const content = renderChildrenAsync(children, childTag);
    if (content instanceof Promise) {
      return content.then((c) => serializeElement(tag, attrStr, c, true));
    }
    return serializeElement(tag, attrStr, content, true);
  }
  return serializeElement(tag, attrStr, "", false);
}

function renderChildrenAsync(children: unknown, rawtextTag?: string): string | Promise<string> {
  if (!Array.isArray(children)) {
    if (typeof children === "string") {
      return rawtextTag ? escapeRawTagContent(children, rawtextTag) : escapeContent(children);
    }
    // Non-string single child: délégué à renderNode sans rawtextTag
    return renderNode(children);
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
      const child = children[i]!;
      // Les strings directes sont échappées avec rawtextTag local ici
      if (typeof child === "string") {
        out += rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
      } else {
        out += renderNode(child);
      }
    }
    return out;
  }

  // At least one async child — resolve all in parallel
  return Promise.all(children.map((child) => {
    if (typeof child === "string") {
      return rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
    }
    return renderNode(child);
  })).then((parts) => parts.join(""));
}

async function collectAsyncIterable(
  iterable: AsyncIterable<unknown>,
): Promise<string> {
  let out = "";
  for await (const chunk of iterable) {
    const rendered = renderNode(chunk);
    out += rendered instanceof Promise ? await rendered : rendered;
  }
  return out;
}
