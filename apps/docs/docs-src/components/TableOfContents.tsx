import { raw, type VNode } from "@vincle/core";

export function TableOfContents(): VNode {
  return raw("<aside data-toc-placeholder></aside>") as unknown as VNode;
}
