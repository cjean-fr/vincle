import { buildAttrs } from "./attrs.js";
import { escapeContent, escapeRawTagContent, isRawtextTag } from "./escape.js";
import { VNode } from "./jsx-runtime.js";
import { RawString } from "./raw.js";
import { invalidTagMessage, isValidTag, serializeElement } from "./serialize.js";

export function renderToString(node: unknown): string {
  return renderNode(node);
}

/**
 * Parcours récursif du VNode tree.
 * N'accepte PAS de rawtextTag — l'échappement spécifique à `<script>` / `<style>`
 * est géré localement dans renderChildren, pas hérité. Les composants contenus
 * dans un script/style sont suffisamment rares pour ne pas justifier la
 * propagation du tag à travers toute la récursion.
 */
function renderNode(vnode: unknown): string {
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string") {
    return escapeContent(vnode);
  }
  if (typeof vnode === "number") return String(vnode);
  if (vnode instanceof RawString) return vnode.value;
  if (Array.isArray(vnode)) return renderChildren(vnode);
  if (!(vnode instanceof VNode)) return escapeContent(String(vnode));

  if (typeof vnode.tag === "function") {
    return renderNode(vnode.tag(vnode.attrs));
  }

  const { tag, attrs, children } = vnode;

  if (!isValidTag(tag)) throw new TypeError(invalidTagMessage(tag));

  const attrStr = buildAttrs(attrs);
  const childTag = isRawtextTag(tag) ? tag : undefined;
  const content = children !== undefined ? renderChildren(children, childTag) : "";
  return serializeElement(tag, attrStr, content, !!children);
}

function renderChildren(children: unknown, rawtextTag?: string): string {
  if (!Array.isArray(children)) {
    if (typeof children === "string") {
      return rawtextTag ? escapeRawTagContent(children, rawtextTag) : escapeContent(children);
    }
    if (typeof children === "number") return String(children);
    if (children == null || children === true || children === false) return "";
    return renderNode(children);
  }
  let out = "";
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    // Strings directes dans le tableau : échappement rawtext local
    if (typeof child === "string") {
      out += rawtextTag ? escapeRawTagContent(child, rawtextTag) : escapeContent(child);
    } else {
      out += renderNode(child);
    }
  }
  return out;
}
