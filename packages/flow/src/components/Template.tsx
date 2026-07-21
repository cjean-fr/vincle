import { useContext, type JSX, type VNode } from "@vincle/core";

import type { MergeType, OnError, TemplateContent } from "../types.js";

import { Flow } from "../context.js";

const isAsyncIterable = (v: unknown): v is AsyncIterable<VNode> =>
  v != null && typeof (v as any)[Symbol.asyncIterator] === "function";

const isThenable = (v: unknown): v is Promise<VNode> =>
  v instanceof Promise ||
  (v != null && typeof (v as any).then === "function");

function isAsyncContent(children: VNode): boolean {
  if (children instanceof Promise) return true;
  if (isAsyncIterable(children)) return true;
  if (Array.isArray(children)) return children.some((c) => isThenable(c) || isAsyncIterable(c));
  return false;
}

export interface TemplateProps {
  target: string;
  children: TemplateContent;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: VNode;
}

export function Template(props: TemplateProps): JSX.Element | null {
  const { config, registerTemplate } = useContext(Flow);
  const { target, children, merge, timeout, onError, fallback } = props;
  const lazy = typeof children === "function" || isAsyncContent(children as VNode);

  registerTemplate(target, {
    content: children,
    merge: merge ?? "replace",
    timeout,
    onError,
  });

  if (!lazy) {
    // Sync content — no placeholder, just registered for inline flush
    return null;
  }

  if (!config.adapter)
    throw new Error(
      "Template requires an adapter for async content. " +
        "Pass { adapter: ... } to renderToStatic " +
        "or use an adapter with renderToStream.",
    );

  return config.adapter.Placeholder({
    id: target,
    src: config.mode === "static" ? config.generatePath(target) : null,
    children: fallback ?? null,
  }) as JSX.Element | null;
}
