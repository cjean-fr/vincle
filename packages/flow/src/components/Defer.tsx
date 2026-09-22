import { snapshotContext, Scope, type JSX } from "@vincle/core";

import type { DeferContent, MergeType, OnError } from "../types.js";

import { Flow, renderPlaceholder } from "../context.js";

export interface DeferProps {
  target?: string;
  children: DeferContent;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: JSX.Element;
}

export function Defer(props: DeferProps): JSX.Element {
  const { registerFragment, nextId } = Scope.get(Flow);
  const { children, merge, timeout, onError, fallback } = props;
  const target = props.target ?? nextId();

  // Throws when there is no adapter: there is no placeholder to render and
  // nothing to patch into without one, so requiring it here, at the point of
  // misuse, beats a `Frame`/`Placeholder` crash further down the pipeline.
  // It also throws when the target is already registered.
  registerFragment(target, {
    content: children,
    treeScope: snapshotContext(),
    merge: merge ?? "replace",
    timeout,
    onError,
    fallback,
  });

  return renderPlaceholder(target, fallback);
}
