import { useContext, type JSX } from "@vincle/core";

import type { MergeType, OnError, TemplateContent } from "../types.js";

import { Flow, renderPlaceholder } from "../context.js";

export interface TemplateProps {
  target: string;
  children: TemplateContent;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: JSX.Element;
}

export function Template(props: TemplateProps): JSX.Element {
  const { registerTemplate } = useContext(Flow);
  const { target, children, merge, timeout, onError, fallback } = props;

  // Throws when there is no adapter — there is no placeholder to render and
  // nothing to patch into without one, so requiring it here, at the point of
  // misuse, beats a `Frame`/`Placeholder` crash further down the pipeline.
  registerTemplate(target, {
    content: children,
    merge: merge ?? "replace",
    timeout,
    onError,
  });

  return renderPlaceholder(target, fallback);
}
