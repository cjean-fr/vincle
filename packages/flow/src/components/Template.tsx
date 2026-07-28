import { useContext, type JSX } from "@vincle/core";

import type { MergeType, OnError, TemplateContent } from "../types.js";

import { Flow } from "../context.js";

export interface TemplateProps {
  target: string;
  children: TemplateContent;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: JSX.Element;
}

export function Template(props: TemplateProps): JSX.Element | null {
  const { config, registerTemplate } = useContext(Flow);
  const { target, children, merge, timeout, onError, fallback } = props;

  registerTemplate(target, {
    content: children,
    merge: merge ?? "replace",
    timeout,
    onError,
  });

  if (!config.adapter) return null;

  return config.adapter.Placeholder({
    id: target,
    src: config.mode === "static" ? config.generatePath(target) : null,
    children: fallback ?? null,
  }) as JSX.Element | null;
}
