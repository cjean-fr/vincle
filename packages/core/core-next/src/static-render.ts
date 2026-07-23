/**
 * Single-pass static fold.
 *
 * `tryRenderStatic` renders an element subtree to a RawString in one traversal:
 * it emits HTML as it walks and bails to {@link NOT_STATIC} the instant it meets
 * a dynamic node (VNode, Promise, function, or an unfoldable prop). This
 * replaces the old detect-then-render design (`isStaticChild` walk +
 * `renderFlatChildren` walk) — children are traversed once, not twice.
 *
 * The bail is signalled through a module-level `sawDynamic` flag rather than a
 * `string | symbol` union return, so `foldChild` stays monomorphic (a union
 * return deoptimises the deep-recursion hot path). `tryRenderStatic` is not
 * re-entrant during a fold — `foldChildren` only reads already-resolved child
 * values, it never calls back into `jsx` — so the shared flag is safe.
 *
 * Fold decision is identical to the tree-walk path's notion of "static", so the
 * two renderers stay byte-equivalent (locked by path-equivalence.test.ts).
 */
import { RawString } from "./raw.js";
import { buildAttrs } from "./attrs.js";
import { escapeHtml, escapeRawTagContent, RAWTEXT_TAGS } from "./escape.js";
import { serializeElement } from "./serialize.js";

/** Sentinel returned by `tryRenderStatic` when the subtree cannot be folded. */
export const NOT_STATIC = Symbol("not-static");

let sawDynamic = false;

export function tryRenderStatic(
  tag: string,
  props: Record<string, unknown>,
): RawString | typeof NOT_STATIC {
  // Prop safety first — cheap, and bails before touching children when a prop
  // (style object / class array / dSIH / Promise) forces the dynamic path.
  for (const key in props) {
    if (key === "children" || key === "key" || key === "ref") continue;
    const v = props[key];
    if (key === "dangerouslySetInnerHTML") return NOT_STATIC;
    if (key === "style" && typeof v === "object" && v !== null && !Array.isArray(v)) return NOT_STATIC;
    if (key === "class" && Array.isArray(v)) return NOT_STATIC;
    if (v instanceof Promise) return NOT_STATIC;
  }

  const children = (props as { children?: unknown }).children;
  const childTag = RAWTEXT_TAGS.has(tag) ? tag : undefined;

  sawDynamic = false;
  const content = foldChildren(children, childTag);
  if (sawDynamic) return NOT_STATIC;

  const attrStr = buildAttrs(props);
  return new RawString(serializeElement(tag, attrStr, content, !!children));
}

function foldChildren(children: unknown, rawtextTag?: string): string {
  if (!Array.isArray(children)) return foldChild(children, rawtextTag);
  let out = "";
  for (let i = 0; i < children.length; i++) {
    out += foldChild(children[i], rawtextTag);
    if (sawDynamic) return ""; // bail: a descendant is dynamic, discard partial work
  }
  return out;
}

function foldChild(child: unknown, rawtextTag?: string): string {
  if (child === null || child === undefined || typeof child === "boolean") return "";
  if (typeof child === "string") {
    return rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeHtml(child);
  }
  if (typeof child === "number") return String(child);
  if (child instanceof RawString) return child.value;
  if (Array.isArray(child)) return foldChildren(child, rawtextTag);
  // VNode / Promise / function / bigint / object → dynamic; hand off to VNode path.
  sawDynamic = true;
  return "";
}
