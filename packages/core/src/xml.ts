/**
 * Experimental: render the same JSX tree to an XML document.
 *
 * The tree is format-neutral, so a second renderer is a second walk, not a
 * second construction. This one is deliberately minimal, and its limits are
 * the contract questions the neutral tree leaves open:
 *
 * - **Vocabulary is not neutral.** Attribute names are written as given:
 *   `className` stays `className`, `strokeWidth` stays `strokeWidth`. The
 *   React-to-HTML tables live in the HTML renderer (`attrs.ts`).
 * - **`raw()` is the caller's responsibility.** Its bytes pass through, as do
 *   precompiled templates (`TemplateNode`), which are HTML text by contract.
 * - **No void elements, no rawtext.** An element without children self-closes,
 *   and text in `<script>` / `<style>` is escaped like any other text.
 *
 * @module
 */

import { ERR_FUNCTION_AS_TEXT, vincleError } from "./errors.js";
import { escapeAttr, escapeContent, isAsyncIterable, isIterable } from "./escape.js";
import { HTML_CONTEXT } from "./parse-context.js";
import { settleConcurrent } from "./render.js";
import { providerMarker, RawString, RawUrl, TemplateNode, VNode, type ProvideFn } from "./types.js";

/** Render a JSX tree to an XML string. Same concurrency rule as `renderToString`. */
export function renderToXml(node: unknown): Promise<string> {
  try {
    return Promise.resolve(renderXmlNode(node));
  } catch (error) {
    return Promise.reject(error);
  }
}

function renderXmlNode(node: unknown): string | Promise<string> {
  if (typeof node === "string") return escapeContent(node);
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "number" || typeof node === "bigint") return String(node);
  if (node instanceof RawString) return node.value;
  if (node instanceof RawUrl) return escapeContent(node.value);
  if (node instanceof Promise) return node.then(renderXmlNode);
  if (Array.isArray(node)) return renderXmlChildren(node);
  if (node instanceof TemplateNode) {
    // Template text is HTML markup: trusted bytes, as `raw()`.
    const result = node.render(HTML_CONTEXT);
    return result instanceof Promise ? result.then((value) => value.value) : result.value;
  }
  if (node instanceof VNode) {
    if (typeof node.tag === "function") {
      const comp = node.tag;
      const provide = (comp as unknown as { [providerMarker]?: ProvideFn })[providerMarker];
      if (provide) {
        return provide(node.attrs["value"], () => renderXmlChildren(asChildList(node.children)));
      }
      return renderXmlNode(comp(node.attrs));
    }
    return renderXmlElement(node.tag, node.attrs, node.children);
  }
  if (isAsyncIterable(node)) return collectXml(node);
  if (isIterable(node)) return renderXmlChildren(Array.from(node));
  if (typeof node === "function") {
    throw vincleError(
      "[vincle/core] A function reached a text position: call it ({fn()}), or use a component as JSX (<Comp />), not interpolated as {Comp}.",
      ERR_FUNCTION_AS_TEXT,
    );
  }
  return escapeContent(String(node));
}

const asChildList = (children: unknown): unknown[] =>
  Array.isArray(children) ? children : [children];

function renderXmlElement(
  tag: string,
  attrs: Record<string, unknown>,
  children: unknown,
): string | Promise<string> {
  const entries: Array<[string, unknown]> = [];
  for (const key in attrs) {
    if (key === "children" || key === "key" || key === "ref" || key === "dangerouslySetInnerHTML")
      continue;
    const value = attrs[key];
    if (value === null || value === undefined || value === false) continue;
    entries.push([key, value]);
  }
  const withAttrs = (attrStr: string): string | Promise<string> => {
    if (children === undefined || children === null) return `<${tag}${attrStr}/>`;
    const content = renderXmlNode(children);
    if (content instanceof Promise) {
      return content.then((c) => `<${tag}${attrStr}>${c}</${tag}>`);
    }
    return `<${tag}${attrStr}>${content}</${tag}>`;
  };
  let pending: Promise<unknown> | undefined;
  for (const [, value] of entries) {
    if (value instanceof Promise) pending = (pending ?? Promise.resolve()).then(() => value);
  }
  if (pending !== undefined) {
    return Promise.all(entries.map(([, v]) => v)).then((resolved) =>
      withAttrs(
        resolved.map((v, i) => ` ${entries[i]![0]}="${escapeAttr(xmlAttrText(v))}"`).join(""),
      ),
    );
  }
  return withAttrs(
    entries.map(([key, value]) => ` ${key}="${escapeAttr(xmlAttrText(value))}"`).join(""),
  );
}

function xmlAttrText(value: unknown): string {
  if (value === true) return "true";
  if (value instanceof RawUrl) return value.value;
  return String(value);
}

function renderXmlChildren(children: unknown[]): string | Promise<string> {
  let out = "";
  for (let i = 0; i < children.length; i++) {
    const part = renderXmlNode(children[i]);
    if (typeof part !== "string") {
      const parts: Array<string | Promise<string>> = [part];
      for (let j = i + 1; j < children.length; j++) {
        let p: string | Promise<string>;
        try {
          p = renderXmlNode(children[j]);
        } catch (error) {
          p = Promise.reject(error);
        }
        parts.push(p);
      }
      return settleConcurrent(parts).then((values) => out + values.join(""));
    }
    out += part;
  }
  return out;
}

async function collectXml(iterable: AsyncIterable<unknown>): Promise<string> {
  let out = "";
  for await (const chunk of iterable) {
    const rendered = renderXmlNode(chunk);
    out += rendered instanceof Promise ? await rendered : rendered;
  }
  return out;
}
