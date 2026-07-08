import type { VincleNode, HTMLAttributes, Awaitable } from "../core/types.js";
import { RawString } from "../core/types.js";
import { isValidTagName, RAWTEXT_TAGS } from "./escape.js";
import { renderAttributes } from "./render-attributes.js";
import { renderChild } from "./render-child.js";
import { VOID_ELEMENTS } from "./void-elements.js";
import { renderCache } from "./render-cache.js";

function renderInnerHTML(
  __html: Awaitable<string | null | undefined>,
): Awaitable<string> {
  if (__html == null) return "";
  if (__html instanceof Promise)
    return __html.then((v: unknown) => (v == null ? "" : String(v)));
  return String(__html);
}

export function renderElement(
  tag: string,
  props: HTMLAttributes,
  children: VincleNode,
): Awaitable<RawString> {
  if (!renderCache.validTags.has(tag)) {
    if (!isValidTagName(tag)) {
      if (!renderCache.warnedTags.has(tag)) {
        renderCache.warnedTags.add(tag);
        console.warn(
          `[vincle/core] Invalid tag name "${tag}" was skipped. Tag names must start with a letter and contain only letters, digits, or hyphens.`,
        );
      }
      return EMPTY_RAW;
    }
    renderCache.validTags.add(tag);
  }
  const attrs = renderAttributes(props);
  const lcTag = tag.toLowerCase();
  const rawtextTag = RAWTEXT_TAGS.has(lcTag) ? lcTag : undefined;
  const content = props.dangerouslySetInnerHTML
    ? renderInnerHTML(props.dangerouslySetInnerHTML.__html)
    : renderChild(children, rawtextTag);

  if (typeof attrs === "string" && typeof content === "string") {
    return new RawString(buildElement(tag, attrs, content));
  }
  return Promise.all([attrs, content]).then(
    ([a, c]) => new RawString(buildElement(tag, a, c)),
  );
}

const EMPTY_RAW = new RawString("");

function buildElement(tag: string, attrs: string, content: string): string {
  if (VOID_ELEMENTS.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${content}</${tag}>`;
}
