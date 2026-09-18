import {
  raw,
  renderToString,
  snapshotContext,
  Scope,
  type JSX,
  type Renderable,
} from "@vincle/core";

import type { DeferContent, FragmentGroupData, MergeType, OnError } from "../types.js";

import { Group, Flow, renderPlaceholder, useGroupScope, type GroupScope } from "../context.js";

export interface DeferProps {
  target?: string;
  children: DeferContent;
  merge?: MergeType;
  timeout?: number;
  onError?: OnError;
  fallback?: JSX.Element;
}

export interface DeferSequenceProps {
  children: Renderable;
}

export interface DeferTogetherProps {
  children: Renderable;
}

/**
 * Register one fragment group and run its children under the group scope:
 * every `<Defer>` below claims its target here, in declared order — that order
 * is what the coordinator releases them in.
 */
async function groupCore(together: boolean, children: Renderable): Promise<JSX.Element> {
  const { fragments, nextId } = Scope.get(Flow);
  const parentScope = useGroupScope();

  const id = nextId();

  const group: FragmentGroupData = {
    id,
    together,
    parentId: parentScope?.group.id,
    items: [],
  };

  fragments.addGroup(group);

  if (parentScope) {
    parentScope.group.items.push({ kind: "group", group });
  }

  const scope: GroupScope = {
    group,
    add(target: string) {
      const existing = group.items.find((it) => it.kind === "fragment" && it.id === target);
      if (!existing) {
        group.items.push({ kind: "fragment", id: target });
      }
    },
  };

  return Scope.with(async () => {
    Scope.set(Group, scope);
    const html = await renderToString(children);
    return raw(html);
  }, Scope.snapshot());
}

/**
 * Release the group's fragments one at a time, in declared order — a fragment
 * never overtakes its left neighbor, even when it finishes first.
 */
export function DeferSequence({ children }: DeferSequenceProps): Promise<JSX.Element> {
  return groupCore(false, children);
}

/**
 * Release the group's fragments as a unit: nothing is flushed until every
 * fragment is ready (or has settled), then the whole group goes at once.
 */
export function DeferTogether({ children }: DeferTogetherProps): Promise<JSX.Element> {
  return groupCore(true, children);
}

export function Defer(props: DeferProps): JSX.Element {
  const { registerFragment, nextId } = Scope.get(Flow);
  const defer = useGroupScope();
  const { children, merge, timeout, onError, fallback } = props;
  const target = props.target ?? nextId();

  if (defer) {
    defer.add(target);
  }

  // Throws when there is no adapter — there is no placeholder to render and
  // nothing to patch into without one, so requiring it here, at the point of
  // misuse, beats a `Frame`/`Placeholder` crash further down the pipeline.
  registerFragment(target, {
    content: children,
    treeScope: snapshotContext(),
    merge: merge ?? "replace",
    timeout,
    onError,
    fallback,
    groupId: defer?.group.id,
  });

  return renderPlaceholder(target, fallback);
}

Defer.Sequence = DeferSequence;
Defer.Together = DeferTogether;
