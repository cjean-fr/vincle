import { useContext, type JSX, type VNode } from "@vincle/core";
import { Flow } from "../context.js";
import type { DeferContent, MergeType, OnError } from "../types.js";

export interface DeferProps {
  children: DeferContent;
  name?: string;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: VNode;
}

export function Defer(props: DeferProps): JSX.Element | null {
  const { config, defer, nextId } = useContext(Flow);
  const adapter = config.adapter;
  const { children, name, merge, timeout, onError, fallback } = props;
  const id = name ?? nextId();

  if (!adapter)
    throw new Error(
      "Defer requires an adapter. " +
        "Pass { adapter: ... } to renderToStatic " +
        "or use an adapter with renderStream.",
    );

  defer(id, {
    content: children,
    merge: merge ?? "replace",
    timeout,
    onError,
  });

  return adapter.Placeholder({
    id,
    src: config.mode === "static" ? config.generatePath(id) : null,
    children: fallback ?? null,
  }) as JSX.Element | null;
}
