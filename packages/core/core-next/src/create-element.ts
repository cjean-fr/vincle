import { VNode } from "./jsx-runtime.js";
import { buildAttrs } from "./attrs.js";
import { RawString } from "./raw.js";
import { escapeHtml, escapeRawTagContent, RAWTEXT_TAGS } from "./escape.js";
import { serializeElement, isValidTag, invalidTagError } from "./serialize.js";

/**
 * Render a VNode tree to an HTML string — **synchronously**.
 *
 * The whole walk returns a plain `string` (monomorphic, no `Promise` union) so
 * JSC/V8 keep it on the fast tier. If it meets a `Promise` or async iterable
 * (an async component or async child), it throws: use `renderToStringAsync`.
 */
function renderToString(node: unknown): string {
  return createElement(node);
}

function throwAsyncInSync(): never {
  throw new Error(
    "[vincle/core] renderToString is synchronous but encountered a Promise or async " +
      "iterable (an async component or async child). Use renderToStringAsync instead.",
  );
}

function createElement(vnode: unknown, rawtextTag?: string): string {
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string") {
    return rawtextTag ? escapeRawTagContent(vnode, rawtextTag) : escapeHtml(vnode);
  }
  if (typeof vnode === "number" || typeof vnode === "bigint") return String(vnode);
  if (vnode instanceof RawString) return vnode.value;
  if (Array.isArray(vnode)) return renderChildren(vnode, rawtextTag);
  if (vnode instanceof VNode) return renderVNode(vnode, rawtextTag);

  // Async values cannot be rendered synchronously.
  if (vnode instanceof Promise) throwAsyncInSync();
  const obj = vnode as { [Symbol.iterator]?: unknown; [Symbol.asyncIterator]?: unknown };
  if (typeof obj[Symbol.asyncIterator] === "function") throwAsyncInSync();
  if (typeof obj[Symbol.iterator] === "function") {
    return renderChildren(Array.from(vnode as Iterable<unknown>), rawtextTag);
  }

  return escapeHtml(String(vnode));
}

function renderVNode(vnode: VNode, rawtextTag?: string): string {
  if (typeof vnode.tag === "function") {
    return createElement(vnode.tag(vnode.attrs), rawtextTag);
  }

  const { tag, attrs, children } = vnode;
  if (!isValidTag(tag)) throw invalidTagError(tag);
  if (tag === "Fragment") return renderChildren(children, rawtextTag);

  const attrStr = buildAttrs(attrs);
  const childTag = RAWTEXT_TAGS.has(tag) ? tag : rawtextTag;
  const content = children !== undefined ? renderChildren(children, childTag) : "";
  return serializeElement(tag, attrStr, content, !!children);
}

function renderChildren(children: unknown, rawtextTag?: string): string {
  if (!Array.isArray(children)) return createElement(children, rawtextTag);
  let out = "";
  for (let i = 0; i < children.length; i++) {
    out += createElement(children[i], rawtextTag);
  }
  return out;
}

export { renderToString };
