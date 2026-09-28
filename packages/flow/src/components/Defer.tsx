import { raw, snapshotContext, Scope, type JSX } from "@vincle/core";

import type { DeferContent, MergeType, OnError } from "../types.js";

import { Flow, pendingMarks, renderPlaceholder } from "../context.js";

export interface DeferProps {
  target?: string;
  children: DeferContent;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: JSX.Element;
}

export function Defer(props: DeferProps): JSX.Element | null {
  const { registerFragment, nextId, slots } = Scope.get(Flow);
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

  // A `<Slot>` of this name is the placeholder: one per id (see `SlotState`).
  if (slots.names.has(target)) return null;
  const placeholder = renderPlaceholder(target, fallback);
  if (props.target === undefined) return placeholder;
  const [open, close] = pendingMarks(slots, target);
  return (
    <>
      {raw(open)}
      {placeholder}
      {raw(close)}
    </>
  );
}
