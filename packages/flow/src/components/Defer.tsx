import {
  raw,
  renderToString,
  setContext,
  snapshot,
  useContext,
  withScope,
  type JSX,
  type Renderable,
} from "@vincle/core";

import type { DeferContent, DeferGroupData, MergeType, OnError } from "../types.js";

import {
  DeferContext,
  Flow,
  renderPlaceholder,
  useDeferScope,
  type DeferScope,
} from "../context.js";

export interface DeferProps {
  target?: string;
  children: DeferContent;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: JSX.Element;
}

export interface DeferGroupProps {
  together?: boolean;
  children: Renderable;
}

export async function DeferGroup(props: DeferGroupProps): Promise<JSX.Element> {
  const { templateStore, nextId } = useContext(Flow);
  const parentScope = useDeferScope();

  const together = props.together ?? false;
  const id = nextId();

  const group: DeferGroupData = {
    id,
    together,
    parentId: parentScope?.group.id,
    items: [],
  };

  templateStore.addDeferGroup(group);

  if (parentScope) {
    parentScope.group.items.push({ kind: "group", group });
  }

  const scope: DeferScope = {
    group,
    claimChild(target: string) {
      const existing = group.items.find((it) => it.kind === "fragment" && it.id === target);
      if (!existing) {
        group.items.push({ kind: "fragment", id: target });
      }
    },
  };

  return withScope(async () => {
    setContext(DeferContext, scope);
    const html = await renderToString(props.children);
    return raw(html);
  }, snapshot());
}

export function Defer(props: DeferProps): JSX.Element {
  const { registerTemplate, nextId } = useContext(Flow);
  const defer = useDeferScope();
  const { children, merge, timeout, onError, fallback } = props;
  const target = props.target ?? nextId();

  if (defer) {
    defer.claimChild(target);
  }

  // Throws when there is no adapter — there is no placeholder to render and
  // nothing to patch into without one, so requiring it here, at the point of
  // misuse, beats a `Frame`/`Placeholder` crash further down the pipeline.
  registerTemplate(target, {
    content: children,
    merge: merge ?? "replace",
    timeout,
    onError,
    fallback,
    deferGroupId: defer?.group.id,
  });

  return renderPlaceholder(target, fallback);
}

Defer.Group = DeferGroup;
