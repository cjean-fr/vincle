import type {
  VincleNode,
  HTMLAttributes,
  JSX,
  Awaitable,
} from "../core/types.js";
import { RawString } from "../core/types.js";
import { isValidTagName, RAWTEXT_TAGS } from "./escape.js";
import { renderAttributes } from "./render-attributes.js";
import { renderChild } from "./render-child.js";
import { VOID_ELEMENTS } from "./void-elements.js";

/**
 * Render a JSX element into an HTML-safe `RawString`.
 *
 * Returning a `RawString` (rather than a plain `string`) lets the result be
 * dropped back into another element's children without being re-escaped — the
 * single boundary that distinguishes "trusted, already-rendered HTML" from
 * "untrusted user text" in the rest of the pipeline.
 *
 * When `props.dangerouslySetInnerHTML` is provided, its `__html` is used as
 * the element content; otherwise the provided children are rendered.
 * Attributes and children may be asynchronous; in that case the function
 * returns a `Promise<RawString>`.
 */
// Cache of tag names already proven safe. Tag names come from a tiny vocabulary
// (HTML/SVG elements + a few user custom-elements) and are reused thousands of
// times per render, so a cache avoids re-running the validation regex.
const VALID_TAGS = new Set<string>();
// Invalid tag names already warned about, so a bad tag in a loop warns once
// instead of flooding the console on every render.
const WARNED_TAGS = new Set<string>();

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
): JSX.Element {
  if (!VALID_TAGS.has(tag)) {
    if (!isValidTagName(tag)) {
      if (!WARNED_TAGS.has(tag)) {
        WARNED_TAGS.add(tag);
        console.warn(
          `[vincle/core] Invalid tag name "${tag}" was skipped. Tag names must start with a letter and contain only letters, digits, or hyphens.`,
        );
      }
      return EMPTY_RAW;
    }
    VALID_TAGS.add(tag);
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
