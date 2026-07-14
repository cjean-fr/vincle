import { useContext } from "@vincle/core";

import type { DeferContent, MergeType } from "../types.js";

import { Flow } from "../context.js";

export interface FillProps {
  target: string;
  children: DeferContent;
  merge?: MergeType;
}

export function Fill(props: FillProps): null {
  const { defer } = useContext(Flow);
  const { target, children, merge } = props;

  defer(target, {
    content: children,
    merge: merge ?? "replace",
  });

  return null;
}
